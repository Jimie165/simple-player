fn main() {
    println!(
        "cargo:rustc-env=SIMPLE_PLAYER_TARGET={}",
        std::env::var("TARGET").expect("Cargo target is required")
    );
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=tauri.macos.conf.json");
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
