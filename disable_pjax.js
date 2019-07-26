chrome.storage.local.get('config', (container) => {
	let secret_options = ("" + container.config['Tail Lines']).split('|||');
	if (secret_options.some((item) => item === 'disable pjax')) {
		disable_pjax();
	}
});

function disable_pjax() {
	document.body.addEventListener('click', (event) => {
		let a = event.target.closest('a');
		if (a) {
			a.setAttribute('data-skip-pjax', true);
		}
	});
}

