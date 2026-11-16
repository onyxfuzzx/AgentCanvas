//! Host-neutral state arguments shared by the desktop IPC and editor sidecar.
pub struct State<'a, T>(&'a T);

impl<'a, T> State<'a, T> {
    pub fn new(value: &'a T) -> Self {
        Self(value)
    }
    pub fn inner(&self) -> &'a T {
        self.0
    }
}

impl<'a, 'de: 'a, T: Send + Sync + 'static, R: tauri::Runtime> tauri::ipc::CommandArg<'de, R>
    for State<'a, T>
{
    fn from_command(
        command: tauri::ipc::CommandItem<'de, R>,
    ) -> Result<Self, tauri::ipc::InvokeError> {
        <tauri::State<'a, T> as tauri::ipc::CommandArg<'de, R>>::from_command(command)
            .map(|state| Self(state.inner()))
    }
}
