use std::process::Stdio;
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum HwAccelType {
    Nvenc,        // NVIDIA GPU
    Qsv,          // Intel Quick Sync
    VideoToolbox, // macOS
    Vaapi,        // Linux (AMD/Intel/NVIDIA)
    None,         // 软件编码
}

impl std::fmt::Display for HwAccelType {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Self::Nvenc => write!(f, "nvenc"),
            Self::Qsv => write!(f, "qsv"),
            Self::VideoToolbox => write!(f, "videotoolbox"),
            Self::Vaapi => write!(f, "vaapi"),
            Self::None => write!(f, "software"),
        }
    }
}

// 全局缓存，只检测一次
static DETECTED_HWACCEL: OnceLock<HwAccelType> = OnceLock::new();

/// 检测可用的硬件编码器（懒加载 + 缓存）
pub fn detect_hardware_encoder(ffmpeg: &str) -> HwAccelType {
    *DETECTED_HWACCEL.get_or_init(|| {
        // 优先级：NVENC > QSV > VideoToolbox > VAAPI > Software
        
        if test_encoder(ffmpeg, "h264_nvenc") {
            return HwAccelType::Nvenc;
        }
        
        if test_encoder(ffmpeg, "h264_qsv") {
            return HwAccelType::Qsv;
        }
        
        #[cfg(target_os = "macos")]
        if test_encoder(ffmpeg, "h264_videotoolbox") {
            return HwAccelType::VideoToolbox;
        }
        
        #[cfg(target_os = "linux")]
        if test_encoder(ffmpeg, "h264_vaapi") {
            return HwAccelType::Vaapi;
        }
        
        HwAccelType::None
    })
}

fn test_encoder(ffmpeg: &str, encoder_name: &str) -> bool {
    let mut cmd = std::process::Command::new(ffmpeg);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.args(["-f", "lavfi", "-i", "testsrc", "-t", "1", "-c:v", encoder_name, "-f", "null", "-"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// 生成硬件加速编码参数
pub fn get_encode_args(hw_type: HwAccelType) -> Vec<String> {
    match hw_type {
        HwAccelType::Nvenc => vec!["-c:v", "h264_nvenc", "-preset", "p1", "-rc", "constqp", "-qp", "23"],
        HwAccelType::Qsv => vec!["-c:v", "h264_qsv", "-preset", "fast", "-global_quality", "20"],
        HwAccelType::VideoToolbox => vec!["-c:v", "h264_videotoolbox", "-b:v", "5M"],
        HwAccelType::Vaapi => vec!["-vaapi_device", "/dev/dri/renderD128", "-c:v", "h264_vaapi", "-b:v", "5M"],
        HwAccelType::None => vec!["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"],
    }
    .into_iter()
    .map(String::from)
    .collect()
}
