use std::collections::VecDeque;

pub const OUTPUT_LIMIT: usize = 1024 * 1024;

#[derive(Default)]
pub struct Output {
    bytes: VecDeque<u8>,
    dropped: u64,
    pub eof: bool,
    pub error: Option<String>,
    recent: VecDeque<u8>,
    escape: u8,
}

impl Output {
    pub fn push(&mut self, bytes: &[u8]) {
        // Non-consuming bounded transcript, stripping split CSI/OSC/DCS/APC
        // strings. This is text history, not a second terminal emulator.
        for &byte in bytes {
            match self.escape {
                0 => match byte {
                    27 => self.escape = 1,
                    b'\r' => self.recent.push_back(b'\n'),
                    b'\n' | b'\t' | 32..=255 => self.recent.push_back(byte),
                    _ => {}
                },
                1 => {
                    self.escape = match byte {
                        b'[' => 2,
                        b']' => 3,
                        b'P' | b'_' | b'^' | b'X' => 5,
                        32..=47 => 7,
                        _ => 0,
                    }
                }
                2 => {
                    if (64..=126).contains(&byte) {
                        self.escape = 0;
                    }
                }
                3 => match byte {
                    7 => self.escape = 0,
                    27 => self.escape = 4,
                    _ => {}
                },
                4 => self.escape = if byte == b'\\' { 0 } else { 3 },
                5 => {
                    if byte == 27 {
                        self.escape = 6;
                    }
                }
                6 => self.escape = if byte == b'\\' { 0 } else { 5 },
                _ => {
                    if (48..=126).contains(&byte) {
                        self.escape = 0;
                    }
                }
            }
        }
        while self.recent.len() > 65536 {
            self.recent.pop_front();
        }
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
    pub fn recent(&self, max: usize) -> String {
        let data: Vec<u8> = self
            .recent
            .iter()
            .skip(self.recent.len().saturating_sub(max))
            .copied()
            .collect();
        String::from_utf8_lossy(&data)
            .chars()
            .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
            .collect()
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
    #[test]
    fn recent_transcript_is_non_consuming_bounded_and_strips_split_control_strings() {
        let mut out = Output::default();
        out.push(b"hi\x1b[3");
        out.push(b"1m red\x1b]52;c;secret");
        out.push(b"\x07\x1bPignored\x1b\\\r\nworld\x08");
        assert_eq!(out.recent(8192), "hi red\n\nworld");
        let before = out.recent(8192);
        out.drain(65536);
        assert_eq!(out.recent(8192), before);
        out.push(&vec![b'x'; 100000]);
        assert_eq!(out.recent(8192).len(), 8192);
    }
}
