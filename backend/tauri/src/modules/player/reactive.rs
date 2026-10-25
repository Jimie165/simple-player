//! Track-local PCM analysis. Only bounded, allocation-free writes run in the audio callback.
//! Detection and visual envelopes are deliberately separate: a sustained bass is not a beat.
use rtrb::{Producer, RingBuffer};
use rustfft::{Fft, FftPlanner, num_complex::Complex};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicU64, Ordering},
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const RATE: f32 = 12_000.0;
const BLOCK: usize = 256;
const BANDS: [(f32, f32); 4] = [(30.0, 80.0), (70.0, 130.0), (120.0, 210.0), (210.0, 760.0)];

#[derive(Clone, Serialize)]
pub(super) struct Onset {
    sequence: u64,
    strength: f32,
    age_ms: f32,
}

#[derive(Clone, Serialize)]
pub(super) struct Frame {
    generation: u64,
    sent_at_ms: u64,
    bass: f32,
    onsets: Vec<Onset>,
}

struct Report {
    generation: u64,
    bass: f32,
    updated: Instant,
    sequence: u64,
    onsets: VecDeque<(u64, f32, Instant)>,
}

pub(super) struct ReactiveState {
    generation: AtomicU64,
    owner: AtomicU64,
    pub(super) enabled: Arc<AtomicBool>,
    report: Mutex<Report>,
}

impl ReactiveState {
    pub(super) fn new() -> Self {
        Self {
            generation: AtomicU64::new(1),
            owner: AtomicU64::new(0),
            enabled: Arc::new(AtomicBool::new(false)),
            report: Mutex::new(Report {
                generation: 0,
                bass: 0.0,
                updated: Instant::now(),
                sequence: 0,
                onsets: VecDeque::with_capacity(16),
            }),
        }
    }

    // Atomic invalidation lets seeks/disable discard in-flight work without locking audio.
    pub(super) fn reset(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::AcqRel) + 1
    }

    pub(super) fn frame(&self) -> Frame {
        let report = self.report.lock().unwrap();
        let generation = self.generation.load(Ordering::Acquire);
        let current = report.generation == generation && report.updated.elapsed().as_millis() < 180;
        Frame {
            generation,
            sent_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            bass: if current { report.bass } else { 0.0 },
            // Repeat recent events across IPC packets. Sequence numbers deduplicate them on UI.
            onsets: if current {
                report
                    .onsets
                    .iter()
                    .filter_map(|&(sequence, strength, time)| {
                        let age_ms = time.elapsed().as_secs_f32() * 1000.0;
                        (age_ms < 250.0).then_some(Onset {
                            sequence,
                            strength,
                            age_ms,
                        })
                    })
                    .collect()
            } else {
                Vec::new()
            },
        }
    }

    fn publish(&self, generation: u64, bass: f32, onset: f32, time: Instant) {
        let mut report = self.report.lock().unwrap();
        if generation != self.generation.load(Ordering::Acquire) {
            return;
        }
        if report.generation != generation {
            report.generation = generation;
            report.onsets.clear();
            report.sequence = 0;
        }
        report.bass = bass;
        report.updated = time;
        if onset > 0.0 {
            report.sequence += 1;
            let sequence = report.sequence;
            if report.onsets.len() == 16 {
                report.onsets.pop_front();
            }
            report.onsets.push_back((sequence, onset, time));
        }
    }
}

#[derive(Clone, Copy)]
struct PcmBlock {
    samples: [[f32; 2]; BLOCK],
    generation: u64,
    start: u64,
    end: Instant,
}

pub(super) struct AnalysisInput {
    producer: Producer<PcmBlock>,
    state: Arc<ReactiveState>,
    block: PcmBlock,
    used: usize,
    position: u64,
    owner: u64,
}

impl AnalysisInput {
    pub(super) fn new(sample_rate: u32, state: Arc<ReactiveState>) -> Self {
        let owner = state.owner.fetch_add(1, Ordering::AcqRel) + 1;
        let generation = state.reset();
        let (producer, mut consumer) = RingBuffer::<PcmBlock>::new(16);
        let output = state.clone();
        std::thread::spawn(move || {
            let mut detector = Detector::new(sample_rate);
            let mut active_generation = 0;
            let mut next_position = 0;
            loop {
                match consumer.pop() {
                    Ok(block) => {
                        if !output.enabled.load(Ordering::Relaxed)
                            || owner != output.owner.load(Ordering::Acquire)
                            || block.generation != output.generation.load(Ordering::Acquire)
                            || block.end.elapsed() > Duration::from_millis(100)
                        {
                            continue;
                        }
                        // Overflow drops analysis, never audio. Reset history across the gap.
                        if active_generation != block.generation || block.start != next_position {
                            detector.reset();
                            active_generation = block.generation;
                        }
                        next_position = block.start + BLOCK as u64;
                        for (i, sample) in block.samples.into_iter().enumerate() {
                            if let Some((bass, onset)) = detector.push(sample) {
                                let offset = Duration::from_secs_f64(
                                    (BLOCK - 1 - i) as f64 / sample_rate as f64,
                                );
                                output.publish(block.generation, bass, onset, block.end - offset);
                            }
                        }
                    }
                    Err(_) => {
                        if consumer.is_abandoned() {
                            break;
                        }
                        let wait = if output.enabled.load(Ordering::Relaxed) {
                            2
                        } else {
                            25
                        };
                        std::thread::sleep(Duration::from_millis(wait));
                    }
                }
            }
        });
        Self {
            producer,
            state,
            block: PcmBlock {
                samples: [[0.0; 2]; BLOCK],
                generation,
                start: 0,
                end: Instant::now(),
            },
            used: 0,
            position: 0,
            owner,
        }
    }

    pub(super) fn reset(&mut self) {
        self.block.generation = self.state.reset();
        self.used = 0;
        self.position = 0;
    }

    pub(super) fn push(&mut self, sample: [f32; 2]) {
        self.position += 1;
        if self.owner != self.state.owner.load(Ordering::Acquire)
            || !self.state.enabled.load(Ordering::Relaxed)
        {
            self.used = 0;
            return;
        }
        if self.used == 0 {
            self.block.generation = self.state.generation.load(Ordering::Acquire);
            self.block.start = self.position - 1;
        }
        self.block.samples[self.used] = sample;
        self.used += 1;
        if self.used == BLOCK {
            self.block.end = Instant::now();
            let _ = self.producer.push(self.block);
            self.used = 0;
        }
    }
}

#[derive(Clone)]
struct LowPass {
    b: [f32; 3],
    a: [f32; 2],
    z: [f32; 2],
}
impl LowPass {
    fn new(frequency: f32, rate: f32, q: f32) -> Self {
        let w = std::f32::consts::TAU * frequency.min(rate * 0.45) / rate;
        let alpha = w.sin() / (2.0 * q);
        let inverse = 1.0 / (1.0 + alpha);
        let b = (1.0 - w.cos()) * inverse;
        Self {
            b: [b * 0.5, b, b * 0.5],
            a: [-2.0 * w.cos() * inverse, (1.0 - alpha) * inverse],
            z: [0.0; 2],
        }
    }
    fn push(&mut self, x: f32) -> f32 {
        let y = self.b[0] * x + self.z[0];
        self.z[0] = self.b[1] * x - self.a[0] * y + self.z[1];
        self.z[1] = self.b[2] * x - self.a[1] * y;
        y
    }
}

struct Window {
    fft: Arc<dyn Fft<f32>>,
    buffer: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
    hann: Vec<f32>,
    previous: Vec<f32>,
}
impl Window {
    fn new(n: usize, planner: &mut FftPlanner<f32>) -> Self {
        let fft = planner.plan_fft_forward(n);
        Self {
            scratch: vec![Complex::default(); fft.get_inplace_scratch_len()],
            fft,
            buffer: vec![Complex::default(); n],
            previous: vec![0.0; n / 2],
            hann: (0..n)
                .map(|i| 0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / (n - 1) as f32).cos())
                .collect(),
        }
    }
    fn analyze(
        &mut self,
        ring: &[Complex<f32>; 1024],
        write: usize,
        rate: f32,
    ) -> ([f32; 4], [f32; 4]) {
        let n = self.buffer.len();
        for (i, value) in self.buffer.iter_mut().enumerate() {
            *value = ring[(write + 1024 - n + i) % 1024] * self.hann[i];
        }
        self.fft
            .process_with_scratch(&mut self.buffer, &mut self.scratch);
        let mut energy = [0.0; 4];
        let mut flux = [0.0; 4];
        let mut counts = [0.0_f32; 4];
        for k in 1..n / 2 {
            // Pack L+iR into one FFT; mirrored-bin power yields mean stereo energy,
            // including anti-phase material which a mono sum would cancel.
            let power = (self.buffer[k].norm_sqr() + self.buffer[n - k].norm_sqr())
                * 0.25
                * (4.0 / n as f32).powi(2)
                / 3.0;
            let rise =
                (10.0 * ((power + 1e-9) / (self.previous[k] + 1e-9)).log10()).clamp(0.0, 18.0);
            self.previous[k] = power;
            let frequency = k as f32 * rate / n as f32;
            for (band, &(low, high)) in BANDS.iter().enumerate() {
                if frequency >= low && frequency <= high {
                    energy[band] += power;
                    flux[band] += rise * (power / (power + 1e-6));
                    counts[band] += 1.0;
                }
            }
        }
        for i in 0..4 {
            flux[i] /= counts[i].max(1.0);
        }
        (energy, flux)
    }
    fn reset(&mut self) {
        self.previous.fill(0.0);
    }
}

#[derive(Clone)]
struct BandHistory {
    previous_db: f32,
    baseline_db: f32,
    novelty: [f32; 96],
    index: usize,
    initialized: bool,
}
impl Default for BandHistory {
    fn default() -> Self {
        Self {
            previous_db: -90.0,
            baseline_db: -90.0,
            novelty: [0.0; 96],
            index: 0,
            initialized: false,
        }
    }
}
impl BandHistory {
    fn score(&mut self, energy: f32, flux: f32) -> f32 {
        let db = 10.0 * energy.max(1e-12).log10();
        if !self.initialized {
            // Starting/resuming in a kick must not require a preceding quiet FFT window.
            // Absolute level and transient evidence still reject silent startup buffers.
            self.previous_db = (db - 7.0).max(-90.0);
            self.baseline_db = (db - 7.0).max(-90.0);
            self.initialized = true;
        }
        let rise = (db - self.previous_db).max(0.0);
        self.previous_db = db;
        let novelty = 0.65 * rise + 0.35 * flux;
        let mut sorted = self.novelty;
        sorted.sort_unstable_by(f32::total_cmp);
        let median = sorted[48];
        for value in &mut sorted {
            *value = (*value - median).abs();
        }
        sorted.sort_unstable_by(f32::total_cmp);
        let threshold = (median + sorted[48] * 3.0).max(1.2);
        self.novelty[self.index] = novelty;
        self.index = (self.index + 1) % 96;
        let contrast = (db - self.baseline_db).max(0.0);
        let follow = if db > self.baseline_db { 0.012 } else { 0.08 };
        self.baseline_db += (db - self.baseline_db) * follow;
        let level = ((db + 58.0) / 25.0).clamp(0.0, 1.0);
        ((novelty - threshold) / threshold.max(2.0)).max(0.0)
            * level
            * (0.6 + 0.4 * (contrast / 6.0).clamp(0.0, 1.0))
    }
}

pub(super) struct Detector {
    input_rate: f32,
    analysis_rate: f32,
    report_hop: usize,
    transient_follow: [f32; 2],
    anti_alias: [[LowPass; 2]; 2],
    transient_filters: [[LowPass; 3]; 2],
    transient: [f32; 2],
    transient_previous: f32,
    onset_peak: f32,
    phase: f32,
    ring: Box<[Complex<f32>; 1024]>,
    write: usize,
    available: usize,
    hop: usize,
    reports: u64,
    fast: Window,
    precise: Window,
    histories: [BandHistory; 3],
    slow_energy: [f32; 4],
    candidate: f32,
    candidate_report: u64,
    last_onset: u64,
    armed: bool,
    body: f32,
}

impl Detector {
    pub(super) fn new(input_rate: u32) -> Self {
        let rate = input_rate.max(1) as f32;
        let mut planner = FftPlanner::new();
        Self {
            input_rate: rate,
            analysis_rate: rate.min(RATE),
            report_hop: (rate.min(RATE) / 120.0).round().max(1.0) as usize,
            transient_follow: [0.004, 0.035].map(|seconds| 1.0 - (-1.0 / (rate * seconds)).exp()),
            anti_alias: std::array::from_fn(|_| {
                [
                    LowPass::new(1800.0, rate, 0.5411961),
                    LowPass::new(1800.0, rate, 1.306563),
                ]
            }),
            transient_filters: std::array::from_fn(|_| {
                [25.0, 210.0, 760.0].map(|f| LowPass::new(f, rate, std::f32::consts::FRAC_1_SQRT_2))
            }),
            transient: [0.0; 2],
            transient_previous: -90.0,
            onset_peak: 0.0,
            phase: 0.0,
            ring: Box::new([Complex::default(); 1024]),
            write: 0,
            available: 0,
            hop: 0,
            reports: 0,
            fast: Window::new(512, &mut planner),
            precise: Window::new(1024, &mut planner),
            histories: std::array::from_fn(|_| BandHistory::default()),
            slow_energy: [0.0; 4],
            candidate: 0.0,
            candidate_report: 0,
            last_onset: 0,
            armed: true,
            body: 0.0,
        }
    }
    fn reset(&mut self) {
        for channel in &mut self.anti_alias {
            for filter in channel {
                filter.z = [0.0; 2];
            }
        }
        for channel in &mut self.transient_filters {
            for filter in channel {
                filter.z = [0.0; 2];
            }
        }
        self.transient = [0.0; 2];
        self.transient_previous = -90.0;
        self.onset_peak = 0.0;
        self.phase = 0.0;
        self.ring.fill(Complex::default());
        self.write = 0;
        self.available = 0;
        self.hop = 0;
        self.reports = 0;
        self.fast.reset();
        self.precise.reset();
        self.histories = std::array::from_fn(|_| BandHistory::default());
        self.slow_energy = [0.0; 4];
        self.candidate = 0.0;
        self.candidate_report = 0;
        self.last_onset = 0;
        self.armed = true;
        self.body = 0.0;
    }

    pub(super) fn push(&mut self, samples: [f32; 2]) -> Option<(f32, f32)> {
        let mut filtered = [0.0; 2];
        let mut power = [0.0; 2];
        for (channel, sample) in samples.into_iter().enumerate() {
            let sample = if sample.is_finite() {
                sample.clamp(-4.0, 4.0)
            } else {
                0.0
            };
            let [low, bass, reference] = self.transient_filters[channel]
                .each_mut()
                .map(|f| f.push(sample));
            power[0] += (bass - low).powi(2) * 0.5;
            power[1] += (reference - bass).powi(2) * 0.5;
            let filtered_sample = self.anti_alias[channel][0].push(sample);
            filtered[channel] = self.anti_alias[channel][1].push(filtered_sample);
        }
        for (current, power) in self.transient.iter_mut().zip(power) {
            let follow = self.transient_follow[usize::from(power <= *current)];
            *current += (power - *current) * follow;
        }
        self.phase += self.analysis_rate;
        if self.phase < self.input_rate {
            return None;
        }
        self.phase -= self.input_rate;
        self.ring[self.write] = Complex::new(filtered[0], filtered[1]);
        self.write = (self.write + 1) % 1024;
        self.available = (self.available + 1).min(1024);
        self.hop += 1;
        if self.available < 512 || self.hop < self.report_hop {
            return None;
        }
        self.hop = 0;
        self.reports += 1;
        let (energy, flux) = self
            .fast
            .analyze(&self.ring, self.write, self.analysis_rate);
        if self.available == 1024 && self.reports.is_multiple_of(2) {
            self.slow_energy = self
                .precise
                .analyze(&self.ring, self.write, self.analysis_rate)
                .0;
        }
        let mut scores = [0.0_f32; 3];
        for i in 0..3 {
            scores[i] = self.histories[i].score(energy[i], flux[i]);
        }
        let bass_power = energy[..3].iter().copied().fold(0.0_f32, f32::max);
        let transient_db = 10.0 * self.transient[0].max(1e-12).log10();
        let attack = ((transient_db - self.transient_previous - 0.8) / 5.0).clamp(0.0, 1.0);
        self.transient_previous = transient_db;
        // Mid energy is a soft penalty, never a veto: mixed vocals must not erase a kick.
        let spectral_reference = energy[3] / (bass_power + energy[3] + 1e-9);
        let transient_reference =
            self.transient[1] / (self.transient[0] + self.transient[1] + 1e-9);
        let reference_ratio = spectral_reference * 0.65 + transient_reference * 0.35;
        let support = (bass_power
            / (self.slow_energy[..3]
                .iter()
                .copied()
                .fold(0.0_f32, f32::max)
                + 1e-8))
            .sqrt()
            .clamp(0.5, 1.5);
        let score = scores.into_iter().fold(0.0_f32, f32::max)
            * (0.75 + 0.25 * attack)
            * (1.0 - reference_ratio * 0.3)
            * support;
        let low_level = ((10.0 * bass_power.max(1e-12).log10() + 58.0) / 28.0).clamp(0.0, 1.0);
        let body_target = low_level * (bass_power / (bass_power + energy[3] + 1e-8)).sqrt();
        self.body += (body_target - self.body)
            * if body_target > self.body {
                0.035
            } else {
                0.018
            };
        if score < 0.12 {
            self.armed = true;
        }
        // A decaying relative floor rejects window-tail/interference bumps without
        // imposing a long cooldown that would discard genuinely dense drum hits.
        self.onset_peak *= (-1.0_f32 / (120.0 * 0.16)).exp();
        let ready = (self.last_onset == 0 || self.reports.saturating_sub(self.last_onset) >= 8)
            && self.transient[0] >= self.onset_peak * 0.08;
        let mut onset = 0.0;
        let candidate_age = self.reports.saturating_sub(self.candidate_report);
        let fresh_attack = attack > 0.08 || (self.candidate > 0.0 && candidate_age <= 2);
        if ready && self.armed && score > 0.18 && fresh_attack {
            if score > 1.5 && attack > 0.25 {
                onset = score;
            } else if self.candidate > 0.0 && score < self.candidate {
                onset = self.candidate;
            } else {
                self.candidate = score;
                self.candidate_report = self.reports;
            }
        } else if ready && self.armed && self.candidate > 0.18 && candidate_age <= 2 {
            onset = self.candidate;
        }
        if onset > 0.0 {
            self.onset_peak = self.transient[0].max(self.onset_peak);
            self.last_onset = self.reports;
            self.armed = false;
            self.candidate = 0.0;
            onset = (0.28 + 0.72 * onset / (onset + 1.0)) * low_level.sqrt();
        } else if self.reports.saturating_sub(self.candidate_report) > 2 {
            self.candidate = 0.0;
        }
        Some((self.body.clamp(0.0, 1.0), onset.clamp(0.0, 1.0)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_onsets_survive_repeated_packets_but_not_reset() {
        let state = ReactiveState::new();
        let generation = state.generation.load(Ordering::Acquire);
        state.publish(
            generation,
            0.4,
            0.7,
            Instant::now() - Duration::from_millis(20),
        );
        assert_eq!(state.frame().onsets.len(), 1);
        assert_eq!(state.frame().onsets[0].sequence, 1);
        assert!(state.frame().onsets[0].age_ms >= 20.0);
        state.reset();
        state.publish(generation, 1.0, 1.0, Instant::now());
        assert_eq!(state.frame().bass, 0.0);
        assert!(state.frame().onsets.is_empty());
    }

    #[test]
    fn reset_clears_every_detection_history() {
        let mut detector = Detector::new(48_000);
        for i in 0..24_000 {
            let sample = (i as f32 * 0.03).sin();
            detector.push([sample, -sample]);
        }
        detector.reset();
        for _ in 0..24_000 {
            if let Some((body, onset)) = detector.push([0.0; 2]) {
                assert_eq!((body, onset), (0.0, 0.0));
            }
        }
    }

    #[test]
    fn analysis_worker_keeps_reporting_after_resume_seek_and_reenable() {
        let state = Arc::new(ReactiveState::new());
        state.enabled.store(true, Ordering::Release);
        let mut input = AnalysisInput::new(48_000, state.clone());
        for transition in 0..4 {
            match transition {
                1 => {
                    state.reset();
                    state.reset();
                } // Pause then resume.
                2 => input.reset(), // Seek.
                3 => {
                    state.enabled.store(false, Ordering::Release);
                    state.reset();
                    input.push([0.0; 2]);
                    state.enabled.store(true, Ordering::Release);
                    state.reset();
                }
                _ => {}
            }
            let generation = state.generation.load(Ordering::Acquire);
            for _ in 0..12 {
                for _ in 0..BLOCK {
                    input.push([0.0; 2]);
                }
                std::thread::sleep(Duration::from_millis(2));
            }
            let deadline = Instant::now() + Duration::from_secs(2);
            while state.report.lock().unwrap().generation != generation {
                assert!(
                    Instant::now() < deadline,
                    "worker stopped after transition {transition}"
                );
                std::thread::sleep(Duration::from_millis(2));
            }
        }
    }
}
