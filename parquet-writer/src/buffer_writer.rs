use napi::bindgen_prelude::*;
use std::io;

pub struct BufferWriter {
  buffer: Buffer
}

impl BufferWriter  {
    pub fn new(buffer: Buffer) -> Self {
        BufferWriter {
            buffer
        }
    }
}

impl io::Write for BufferWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        println!("WRITE {} -> {}", buf.len(), self.buffer.len());
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        println!("FLUSH {}", self.buffer.len());
        Ok(())
    }
}