let target_regexes = [
	/https:\/\/github\.com\/pytorch\/pytorch\/pull\/\d+$/,
	/https:\/\/github\.com\/pytorch\/pytorch\/pull\/\d+\/commits$/,
	/https:\/\/github\.com\/pytorch\/pytorch\/pull\/\d+\/files$/
];

document.addEventListener('click', (e) => {
	if (e.target.localName === 'a' && e.target.href) {
		let matches = target_regexes.some((regex) => e.target.href.match(regex));

		if (matches) {
			e.preventDefault();
			e.stopImmediatePropagation();
			e.stopPropagation();
			window.location = e.target.href;
		}
	}
});