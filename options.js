let properties = [
	{
		'name': 'token',
		'title': 'Enter your <a href="https://circleci.com/docs/2.0/managing-api-tokens/#creating-a-personal-api-token">CircleCI auth token</a>',
		'short': 'Token'
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
	}
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
			prop.input.value = container.info[prop.name];
			prop.display.innerText = container.info[prop.name];
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
