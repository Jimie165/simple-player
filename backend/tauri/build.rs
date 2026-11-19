#[path = "build_support/asset_cache.rs"]
mod asset_cache;

fn main() {
    println!(
        "cargo:rustc-env=SIMPLE_PLAYER_TARGET={}",
        std::env::var("TARGET").expect("Cargo target is required")
    );
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=tauri.macos.conf.json");
    println!("cargo:rerun-if-changed=icons");
    // dev 模式通过 devUrl 加载前端，不嵌入 dist；仅在 release 构建时监听，避免前端构建后触发无谓的后端重编译。
    if std::env::var("PROFILE").is_ok_and(|profile| profile == "release") {
        println!("cargo:rerun-if-changed=../../frontend/dist");
    }
    let out_dir = std::env::var_os("OUT_DIR").expect("Cargo must provide OUT_DIR");
    asset_cache::remove_empty_assets(std::path::Path::new(&out_dir))
        .expect("failed to invalidate empty Tauri asset cache files");
    tauri_build::build()
}
