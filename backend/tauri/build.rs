#[path = "build_support/asset_cache.rs"]
mod asset_cache;

fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=../../frontend/dist");
    let out_dir = std::env::var_os("OUT_DIR").expect("Cargo must provide OUT_DIR");
    asset_cache::remove_empty_assets(std::path::Path::new(&out_dir))
        .expect("failed to invalidate empty Tauri asset cache files");
    tauri_build::build()
}
