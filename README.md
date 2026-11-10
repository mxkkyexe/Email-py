# Gmail Copy Recipients

A small Chrome extension that adds a copy icon beside the recipient-details arrow on each open Gmail message. The icon follows Gmail's light or dark text color. One click copies the message's To, Cc, and Bcc email addresses as a comma-separated list, with duplicates removed. It does not include the sender. Bcc addresses are included only when Gmail shows them to your account.

## Install locally

1. Download this repository with **Code → Download ZIP**, then extract it. Alternatively, clone it with `git clone https://github.com/mxkkyexe/Email-py.git`.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select the extracted or cloned `Email-py` folder (the one containing `manifest.json`).
5. Reload any open Gmail tab, open a message, and click the copy icon beside the recipient-details arrow. A check mark briefly confirms the copy.

To try a newer version, update the folder and click the extension's **Reload** button on `chrome://extensions`, then reload Gmail.

## Notes

The extension runs only on `mail.google.com`. It uses the clipboard write permission and does not send or store message data. Gmail does not provide a stable DOM API for this button or its details panel, so Gmail interface changes may require selector updates.
