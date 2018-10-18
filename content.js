'use strict'

let token = undefined;
let repo = undefined;
let username = undefined;
let log_lines = undefined;
let vcs = 'github';
let current_display = undefined;
let current_spinner = undefined;

chrome.storage.local.get('info', (items) => {
	token = items.info.token;
	username = items.info.username;
	repo = items.info.repo;
	log_lines = items.info.num_lines;
});

let initialized = false;

document.addEventListener('click', (event) => {
	let target = event.target.closest('div.branch-action-body div.merge-status-item');
	if (!target) {
		return;
	}

	if (!initialized) {
		initialized = true;
		get_builds((builds) => {
			builds.forEach((build) => {
				// Add click event
				build.element.addEventListener('click', () => {
					show_build.call(build);
				});
			});

			builds.forEach((build) => {
				if (build.element === target) {
					show_build.call(build);
				}
			});
		});
	}
});



function get_builds(callback) {
	// spin until tests load
	const body = document.querySelector('div.branch-action-body');
	let elements = body.querySelectorAll('.merge-status-item');
	body.querySelector('.merge-status-list').style['max-height'] = 'none';

	let builds = [];

	for (let i = 0; i < elements.length; i++) {
		let el = elements[i];
		let link = el.querySelector('.status-actions').href;
		let id = get_build_id(link);
		if (!id) {
			// Not a valid build
			continue;
		}
		builds.push({
			element: el,
			name: el.querySelector('strong').innerText,
			link: link,
			id: id
		});
	}

	callback(builds);
}

function show_build(action_index) {
	clear_current_display();

	current_spinner = build_spinner(this);
	insert_after(this.element, current_spinner);

	fetch_log(this.id, token, action_index, (raw_log, url, build_result, selected_step) => {
		if (current_display) {
			this.element.parentNode.removeChild(current_display);
		}
		if (current_spinner) {
			this.element.parentNode.removeChild(current_spinner);
		}
		current_display = build_display(this, raw_log, url, build_result, selected_step);
		insert_after(this.element, current_display);
	})
}

function insert_after(element, toInsert) {
	let next = element.nextSibling;
	if (next) {
		element.parentNode.insertBefore(toInsert, next);
	} else {
		element.parentNode.insert(toInsert);
	}
}

function build_dropdown(items, onchange) {
	let select = document.createElement("select");

	items.forEach((item) => {
		let option = document.createElement("option");

		option.setAttribute('value', item.value);
		if (item.selected) {
			option.setAttribute('selected', 'selected');
		}
		option.appendChild(document.createTextNode(item.value));

		select.appendChild(option);
	});

	select.addEventListener('change', onchange);

	return select;
}

function build_display(build, raw_log, url, build_result, selected_step) {
	let div = document.createElement("div");
	div.appendChild(build_btn({
		text: "View full log",
		click: () => {
			pre.removeChild(pre.firstChild);
			let text_node = document.createTextNode(process_log(raw_log, true));
			pre.appendChild(text_node);
		}
	}));

	div.appendChild(build_btn({
		text: "Retry build",
		click: () => {
			retry_build(build);
		}
	}));

	let actions = [];

	if (build_result.steps) {
		build_result.steps.forEach((step) => {
			actions.push({
				value: step.name,
				selected: step.name === selected_step
			});
		});
	}
	
	let span = document.createElement("span");
	span.innerHTML = "Build step:"
	div.appendChild(span);

	div.appendChild(build_dropdown(actions, (event) => {
		let i = event.target.selectedIndex;
		show_build.call(build, i);
	}));

	let pre = document.createElement("pre");
	pre.appendChild(document.createTextNode(process_log(raw_log)));
	div.appendChild(pre);

	return div;
}

function build_btn(opts) {
	let btn = document.createElement("button");
	btn.appendChild(document.createTextNode(opts.text));
	btn.addEventListener('click', opts.click);
	return btn;
}

function clear_current_display() {
	if (!this || !this.element) {
		return;
	}
	if (current_display && current_display.previousSibling == this.element) {
		this.element.parentNode.removeChild(current_display);
		current_display = undefined;
		return;
	}
}

function retry_build(build) {
	request(build_retry_url(build.id), {
		method: "POST",
		success: clear_current_display
	});
}

function build_spinner(build) {
	let p = document.createElement("p");
	p.appendChild(document.createTextNode("Loading build " + build.id));
	return p;
}

function build_info_url(build_id) {
	return `https://circleci.com/api/v1.1/project/${vcs}/${username}/${repo}/${build_id}?circle-token=${token}`;
}

function build_retry_url(build_id) {
	return `https://circleci.com/api/v1.1/project/${vcs}/${username}/${repo}/${build_id}/ssh?circle-token=${token}`;
}

function nthFromEnd(str, pat, n) {
    let i = -1;
    let search_backward_from = str.length;
    while (n-- > 0) {
        i = str.lastIndexOf(pat, search_backward_from);
        search_backward_from = i - pat.length;
        if (search_backward_from < 0) {
        	break;
        }
    }
    return i;
}

function get_build_id(link) {
	let match = link.match(/\d+(?=\?)/g);
	if (!match || match.length != 1) {
		return;
	}
	return match[0];
}

function fetch_log(build_id, token, action_index, callback) {
	request(build_info_url(build_id, token), {
		success: (result) => {
			result = JSON.parse(result);
			// let build_result = result.steps[0];
			let i = action_index;
			if (!i) {
				i = default_step(result);				
			}
			let url = result.steps[i].actions[0].output_url;
			let name = result.steps[i].name;
			// let url = build_result.actions[0].output_url;
			if (!url) {
				callback("No log", url, result, name);
				return;
			}
			request(url, {
				success: (log) => {
					callback(log, url, result, name);
				}
			})
		}
	});
}

function default_step(build_result) {
	let steps = build_result.steps;
	for (let i = steps.length - 1; i >= 0; i--) {
		if (steps[i].actions[0].output_url) {
			return i;
		}
	}
	return false;
}

function process_log(raw, is_full) {
	let tail = raw.replace(/\/r/, '');
	if (!is_full) {
		tail = tail.substring(nthFromEnd(tail, '\\n', log_lines));
		tail = tail.substring(tail.indexOf('\\n', tail.length) + 3);
	}
	tail = tail.replace(/\\r\\n/g, '\n');
	tail = tail.replace(/(\\r)|(\\n)/g, '\n');
	return tail.replace(/\n\s*\n/g, '\n');
}

function empty() { }

function request(url, opts) {
	const method = opts.method || 'GET';
	const body = opts.body || {};
	const success = opts.success || empty;
	const error = opts.error || empty;

	const req = new XMLHttpRequest();

	req.open(method, url);
	req.setRequestHeader('Accept', 'application/json');
	req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	
	req.onreadystatechange = function() {
		if (req.readyState == 4) {
			if (req.status >= 200 && req.status < 300) {
				try {
					success(req.responseText);
				} catch (e) {
					error("Can't parse JSON: " + req.responseText);					
				}
			} else {
				error(req);
			}
		}
	}
	
	req.onerror = function() {
		error();
	};

	if (body) {
		req.send(JSON.stringify(body));
	} else {
		req.send();
	}
}