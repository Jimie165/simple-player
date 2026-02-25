export function detectHevcSupport(): boolean {
    if (typeof document === 'undefined') return false;
    const video = document.createElement('video');
    const candidates = [
        'video/mp4; codecs="hvc1.1.6.L123.B0, mp4a.40.2"',
        'video/mp4; codecs="hev1.1.6.L123.B0, mp4a.40.2"',
        'video/mp4; codecs="hvc1"',
        'video/mp4; codecs="hev1"',
    ];
    return candidates.some((candidate) => video.canPlayType(candidate) !== '');
}

export function detectSupportedAudioCodecs(): string[] {
    if (typeof document === 'undefined') return ['aac', 'mp3'];
    const video = document.createElement('video');
    const codecs = new Set<string>(['aac']);

    if (video.canPlayType('audio/mpeg') !== '') codecs.add('mp3');

    if (video.canPlayType('audio/flac') !== '' || video.canPlayType('video/mp4; codecs="flac"') !== '') {
        codecs.add('flac');
    }

    const ac3Candidates = [
        'video/mp4; codecs="ac-3"',
        'video/mp4; codecs="ec-3"',
        'audio/ac3',
        'audio/ac-3',
        'audio/eac3',
        'audio/ec-3',
    ];
    if (ac3Candidates.some(candidate => video.canPlayType(candidate) !== '')) {
        codecs.add('ac3');
        codecs.add('eac3');
    }

    if (video.canPlayType('audio/ogg; codecs=opus') !== '' || video.canPlayType('video/mp4; codecs="opus"') !== '') {
        codecs.add('opus');
    }

    if (video.canPlayType('audio/ogg; codecs=vorbis') !== '') {
        codecs.add('vorbis');
    }

    return Array.from(codecs);
}
