import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// "The whisper pop-out in chat is stuck in the chat. It should pop out as its own box." (Brandon, November 10, 2026)
// The Table's chat is a frame; its whisper boxes now go on the Table page itself (table/chat.php + js/chat-panel.js).

const read = (path) => readFileSync(new URL(`../../../../../${path}`, import.meta.url), 'utf8');
const chatPanel = read('js/chat-panel.js');
const chatPage = read('table/chat.php');
const hostSource = chatPage.slice(chatPage.indexOf('function tableWhisperHost()'), chatPage.indexOf('window.initChatPanel(window.tableChatUser'));

const CHAT_MARKUP = `<style>.chat-whisper-popouts { position: fixed; } .chat-message { color: red; }</style>
  <aside id="chat-panel" class="chat-panel"><div id="chat-message-list"></div><div id="chat-whisper-targets"></div>
  <form id="chat-input-form"><textarea id="chat-input"></textarea><button id="chat-send-btn">Send</button></form></aside>
  <button id="chat-panel-toggle"></button>
  <div id="chat-whisper-popouts" class="chat-whisper-popouts"></div><div id="chat-whisper-alerts"></div>`;

function chatIn({ onTable }) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><iframe></iframe></body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/dnd/table/index.php' });
  if (onTable) dom.window.Table = {};
  const frame = dom.window.document.querySelector('iframe').contentWindow;
  frame.document.body.innerHTML = CHAT_MARKUP;
  frame.chatParticipants = [{ id: 'gm', name: 'Director' }, { id: 'cal', name: 'Cal' }];
  frame.fetch = async () => ({ ok: true, json: async () => ({ success: true, data: [], messages: [] }) });
  frame.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  frame.eval(chatPanel);
  frame.eval(`${hostSource}; window.initChatPanel(true, 'gm', { whisperHost: tableWhisperHost });`);
  return { dom, frame };
}

test('on the Table a whisper box opens on the Table page, not inside the chat window', () => {
  const { dom, frame } = chatIn({ onTable: true });
  const button = [...frame.document.querySelectorAll('.chat-whisper-btn')].find((b) => /cal/i.test(b.textContent));
  assert.ok(button, 'a whisper button for Cal');
  button.click();
  const table = dom.window.document;
  const box = table.querySelector('#table-whisper-popouts .chat-whisper-popout');
  assert.ok(box, 'the box is on the Table');
  assert.ok(box.classList.contains('chat-whisper-popout--open'));
  assert.equal(frame.document.querySelector('.chat-whisper-popout'), null, 'nothing left inside the chat');
  const css = table.getElementById('table-whisper-popouts-css').textContent;
  assert.match(css, /\.chat-whisper-popouts/, 'its look comes along');
  assert.doesNotMatch(css, /chat-message \{/, 'and nothing else of the chat page');
  frame.dispatchEvent(new frame.Event('pagehide'));
  assert.equal(table.querySelector('.chat-whisper-popout'), null, 'the box goes when the chat page goes');
  dom.window.close();
});

test('chat on its own page (popped out, no Table) keeps its whisper boxes', () => {
  const { dom, frame } = chatIn({ onTable: false });
  frame.document.querySelector('.chat-whisper-btn').click();
  assert.ok(frame.document.querySelector('#chat-whisper-popouts .chat-whisper-popout'));
  assert.equal(dom.window.document.getElementById('table-whisper-popouts'), null);
  dom.window.close();
});
