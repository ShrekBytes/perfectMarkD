// A local mock of the OpenAI-compatible chat-completions API for browser
// verification of the AI flows. Dev-only; never imported by app code.
// - Stylesheet requests: answers with a whole-CSS rewrite.
// - Markdown requests: answers with SEARCH/REPLACE blocks that uppercase the
//   document's first heading (or append a line when there is none).
import http from 'node:http';

const CSS_REPLY =
  '.mpdf-doc h1 { letter-spacing: 0.05em; color: #7c3aed; }\n.mpdf-doc p { color: #334; }';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    const payload = JSON.parse(body || '{}');
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const last = [...messages].reverse().find((m) => m && m.role === 'user');
    const prompt = typeof last?.content === 'string' ? last.content : '';
    const content = prompt.includes('<document>')
      ? markdownReply(prompt)
      : CSS_REPLY;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'mock',
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content },
          },
        ],
      }),
    );
  });
});

function markdownReply(prompt) {
  const doc = prompt.split('<document>')[1]?.split('</document>')[0] ?? '';
  const heading = doc.split('\n').find((line) => /^#{1,6}\s/.test(line));
  if (!heading) {
    const lastLine = doc.trimEnd().split('\n').pop() || 'Document';
    return `<<<<<<< SEARCH\n${lastLine}\n=======\n${lastLine}\n\nReviewed by AI.\n>>>>>>> REPLACE`;
  }
  const replaced = heading.replace(
    /^(#{1,6}\s)(.*)$/,
    (_, marks, text) => `${marks}${text.toUpperCase()} — REVIEWED`,
  );
  return `<<<<<<< SEARCH\n${heading}\n=======\n${replaced}\n>>>>>>> REPLACE`;
}

server.listen(9393, () => {
  console.log('mock AI provider on http://localhost:9393');
});
