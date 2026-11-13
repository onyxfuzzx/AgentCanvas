fn main() {
    println!("cargo:rerun-if-changed=../product.json");
    tauri_build::build();
    // Mock-runtime IPC tests link common controls too. Tauri embeds this dependency
    // in application binaries; test harnesses also need the v6 activation context.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap())
            .join("tests/windows.manifest");
        println!("cargo:rerun-if-changed=tests/windows.manifest");
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }
}
