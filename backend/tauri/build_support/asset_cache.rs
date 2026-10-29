use std::{fs, io, path::Path};

/// Tauri reuses existing compressed assets without validating them. An empty
/// cache entry cannot be decompressed and makes the asset request fall back to HTML.
pub fn remove_empty_assets(out_dir: &Path) -> io::Result<()> {
    let entries = match fs::read_dir(out_dir.join("tauri-codegen-assets")) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    for entry in entries {
        let entry = entry?;
        if entry.file_type()?.is_file() && entry.metadata()?.len() == 0 {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn invalidates_empty_assets_without_removing_valid_cache_or_other_outputs() {
        let root = std::env::temp_dir().join(format!(
            "simple-player-asset-cache-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        remove_empty_assets(&root).unwrap();
        let assets = root.join("tauri-codegen-assets");
        fs::create_dir_all(&assets).unwrap();
        fs::write(assets.join("broken.js"), []).unwrap();
        fs::write(assets.join("valid.js"), [0x3b]).unwrap();
        fs::write(root.join("other-output"), []).unwrap();
        remove_empty_assets(&root).unwrap();
        assert!(!assets.join("broken.js").exists());
        assert_eq!(fs::read(assets.join("valid.js")).unwrap(), [0x3b]);
        assert!(root.join("other-output").exists());
        fs::remove_file(assets.join("valid.js")).unwrap();
        fs::remove_file(root.join("other-output")).unwrap();
        fs::remove_dir(assets).unwrap();
        fs::remove_dir(root).unwrap();
    }
}
