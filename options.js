let properties = [
	{
		'name': 'token',
		'title': 'Enter your <a href="https://circleci.com/docs/2.0/managing-api-tokens/#creating-a-personal-api-token">CircleCI auth token</a>',
		'short': 'CircleCI Token'
	},
	{
		'name': 'username',
		'title': 'CircleCI Username',
		'short': 'Username'
	},
	{
		'name': 'repo',
		'title': 'CircleCI Repo',
		'short': 'Repo'
	},
	{
		'name': 'num_lines',
		'title': 'Number of tail lines to show',
		'short': 'Tail lines'
	},
	{
		'name': 'regex_placeholder',
		'title': 'Default line regex',
		'short': 'Default line regex'
	},
	{
		'name': 'github_token',
		'title': '<a href="https://github.com/settings/tokens">GitHub OAuth Token</a>',
		'short': 'GitHub OAuth Token'
	},

]

function save() {
	let data = {
	};
	properties.forEach((prop) => {
		data[prop.name] = prop.input.value.trim();
	});

	chrome.storage.local.set({'info': data}, () => {
		status.innerText = 'Information saved';
		setTimeout(() => {
			status.innerText = '';
		}, 2000);
		show_info();
	});
}

function show_info() {
	chrome.storage.local.get('info', (container) => {
		properties.forEach((prop) => {
			let value = container.info[prop.name];
			if (value === undefined) {
				value = '';	
			}
			prop.input.value = value;
			prop.display.innerText = value;
		});
	});
}

const table = document.getElementById('data');
const inputs = document.getElementById('inputs');

properties.forEach((prop) => {
	let tr = document.createElement('tr');
	tr.innerHTML = `<td>${prop.short}</td><td class="value">None</td>`;
	table.appendChild(tr);

	let div = document.createElement('div');
	div.innerHTML = `<h1>${prop.title}</h1><input id="${prop.name}">`;
	inputs.appendChild(div);

	prop.input = div.querySelector('input');
	prop.display = tr.querySelector('.value');
});

document.addEventListener('DOMContentLoaded', show_info);
document.getElementById('save').addEventListener('click', save);
