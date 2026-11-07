fn main() {
    println!("cargo:rerun-if-changed=../product.json");
    tauri_build::build();
}
