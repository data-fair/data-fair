use std::io;

pub struct BufferWriter {
    accumulated: Vec<u8>,
}

impl BufferWriter {
    pub fn new() -> Self {
        BufferWriter {
            accumulated: Vec::new(),
        }
    }

    pub fn consume(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.accumulated)
    }
}

impl io::Write for BufferWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.accumulated.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}