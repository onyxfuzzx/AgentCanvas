use std::collections::VecDeque;

pub const OUTPUT_LIMIT: usize = 1024 * 1024;

#[derive(Default)]
pub struct Output {
    bytes: VecDeque<u8>,
    dropped: u64,
    pub eof: bool,
    pub error: Option<String>,
}

impl Output {
    pub fn push(&mut self, bytes: &[u8]) {
        let excess = self
            .bytes
            .len()
            .saturating_add(bytes.len())
            .saturating_sub(OUTPUT_LIMIT);
        let from_queue = excess.min(self.bytes.len());
        self.bytes.drain(..from_queue);
        let skip = excess - from_queue;
        self.dropped = self.dropped.saturating_add(excess as u64);
        self.bytes.extend(&bytes[skip..]);
    }

    pub fn drain(&mut self, max: usize) -> (Vec<u8>, u64, bool) {
        let count = max.min(self.bytes.len());
        let bytes = self.bytes.drain(..count).collect();
        let dropped = std::mem::take(&mut self.dropped);
        (bytes, dropped, self.eof && self.bytes.is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_utf8_as_bytes_and_drains_in_order() {
        let mut out = Output::default();
        let input = "a\u{754c}\u{1f642}".as_bytes();
        out.push(input);
        out.eof = true;
        let (a, dropped, done) = out.drain(3);
        let (b, _, done2) = out.drain(100);
        assert_eq!([a, b].concat(), input);
        assert_eq!(dropped, 0);
        assert!(!done);
        assert!(done2);
    }

    #[test]
    fn noisy_output_is_bounded_with_explicit_loss() {
        let mut out = Output::default();
        out.push(&vec![1; OUTPUT_LIMIT + 17]);
        out.push(&[2; 9]);
        let (bytes, dropped, _) = out.drain(OUTPUT_LIMIT);
        assert_eq!(bytes.len(), OUTPUT_LIMIT);
        assert_eq!(dropped, 26);
        assert_eq!(&bytes[bytes.len() - 9..], &[2; 9]);
        assert_eq!(out.drain(1).1, 0);
    }
}
