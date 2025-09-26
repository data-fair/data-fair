use neon::{prelude::{JsArrayBuffer, JsFunction, FunctionContext, Handle, Root, Context, Channel}};
use std::io::{self, Write};

pub struct BufferStreamWriter {
    channel: Channel,
    data_callback: Root<JsFunction>,
    end_callback: Root<JsFunction>,
}

impl <'cx> BufferStreamWriter {
    pub fn new(cx: &'cx mut FunctionContext<'cx>, data_callback: Root<JsFunction>, end_callback: Root<JsFunction>) -> Self {
        let channel = cx.channel();
        BufferStreamWriter {
            channel,
            data_callback,
            end_callback,
        }
    }
}

impl Write for BufferStreamWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.channel.send(move |mut cx| {
            let js_buffer = JsArrayBuffer::from_slice(cx, buf);
            self.data_callback
                .into_inner(&mut cx)
                .bind(&mut cx)
                .arg(js_buffer)
                .unwrap()
                .call::<()>()
                .unwrap();
            Ok(())
        });
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.channel.send(move |mut cx| {
            self.end_callback
                .into_inner(&mut cx)
                .bind(&mut cx)
                .call::<()>()
                .unwrap();
            Ok(())
        });
        Ok(())
    }
}

unsafe impl Send for BufferStreamWriter <'_> {}