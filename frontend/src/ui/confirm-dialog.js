let dialog = null;
let messageEl = null;
let acceptBtn = null;
let cancelBtn = null;

function ensureDialog() {
  if (dialog) return;

  dialog = document.createElement('dialog');
  dialog.id = 'confirm-dialog';
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <p id="confirm-dialog-message"></p>
    <div class="dialog-actions">
      <button type="button" id="confirm-dialog-cancel" class="btn btn-ghost">Cancelar</button>
      <button type="button" id="confirm-dialog-accept" class="btn btn-primary">Aceptar</button>
    </div>
  `;
  document.body.appendChild(dialog);

  messageEl = dialog.querySelector('#confirm-dialog-message');
  acceptBtn = dialog.querySelector('#confirm-dialog-accept');
  cancelBtn = dialog.querySelector('#confirm-dialog-cancel');
}

export function confirmDialog(message) {
  ensureDialog();
  messageEl.textContent = message;

  return new Promise((resolve) => {
    function cleanup(result) {
      acceptBtn.removeEventListener('click', onAccept);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      dialog.close();
      resolve(result);
    }

    function onAccept() {
      cleanup(true);
    }

    function onCancel() {
      cleanup(false);
    }

    function onClose() {
      acceptBtn.removeEventListener('click', onAccept);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(false);
    }

    acceptBtn.addEventListener('click', onAccept);
    cancelBtn.addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose, { once: true });

    dialog.showModal();
  });
}
