// Sảnh: lưới avatar người đang có mặt/vừa tương tác, chưa xếp hàng (tối đa 24, mới nhất trước).
import { avatarEl } from './ui-queue.js';

export function createLobbyUi(root) {
  const cells = Array.from(root.children);
  function render(state) {
    const list = state.lobby || [];
    cells.forEach((cell, i) => {
      const p = list[i];
      const id = p ? p.viewerId : '';
      if (cell.dataset.id === id) return;
      cell.dataset.id = id;
      cell.innerHTML = '';
      const size = cell.style.width;
      if (!p) { const d = document.createElement('div'); d.className = 'av empty'; d.style.width = size; d.style.height = size; cell.appendChild(d); return; }
      const av = avatarEl(p);
      av.style.width = size; av.style.height = size;
      const nm = document.createElement('div');
      nm.className = 'nm'; nm.textContent = Array.from(p.name).slice(0, 8).join('');
      cell.append(av, nm);
    });
  }
  return { render };
}
