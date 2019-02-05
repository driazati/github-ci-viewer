chrome.storage.local.get('info', (items) => {
	if (items.info.disable_pjax && items.info.disable_pjax === '1') {
		document.body.addEventListener('click', (event) => {
			let a = event.target.closest('a');
			if (a) {
				a.setAttribute('data-skip-pjax', true);
			}
		});
	}
});

