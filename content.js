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
let click_handled = true;

function main(event) {
	console.log("Document click", click_handled)
	if (!click_handled) {
		console.log("Re-doing");
		initialized = false;
		click_handled = true;
	}

	let target = event.target.closest('div.branch-action-body div.merge-status-item');
	let body = event.target.closest('.merge-status-list');
	// let target = body.querySelector('div.merge-status-item')
	if (!target) {
		return;
	}

	if (!initialized) {
		initialized = true;
		get_builds(body, (builds) => {
			builds.forEach((build) => {
				function build_click() {
					// if (click_handled) {
					// 	return;
					// }
					console.log("Button clicked", click_handled)
					click_handled = true;
					show_build.call(build);
				}
				build.element.removeEventListener('click', build_click);
				// Add click event
				build.element.addEventListener('click', build_click);
			});

			builds.forEach((build) => {
				if (build.element === target) {
					show_build.call(build);
				}
			});
		});
	}
	click_handled = false;
}

document.addEventListener('click', main);


function get_builds(body, callback) {
	let elements = body.querySelectorAll('.merge-status-item');
	body.style['max-height'] = 'none';

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

function show_build(action_index, is_updating) {
	// debugger;
	console.log("show build", is_updating)
	console.log("show build", this.element.nextSibling === current_display)
	console.log("show build", !is_updating && this.element.nextSibling === current_display)
	if (!is_updating && this.element.nextSibling === current_display) {
		clear_current_display();
		return;
	}
	clear_current_display();
	console.log("Show build")



	current_spinner = build_spinner(this);
	insert_after(this.element, current_spinner);

	fetch_log(this.id, token, action_index, (raw_log, url, build_result, selected_step) => {
		console.log("fetch log")
		remove(current_spinner);
		remove(current_display);

		current_display = build_display(this, raw_log, url, build_result, selected_step);
		insert_after(this.element, current_display);
	})
}

function remove(element) {
	if (element && element.parentNode) {
		try {
			element.parentNode.removeChild(element);			
		} catch (e) {

		}
	}
}

function insert_after(element, toInsert) {
	let next = element.nextSibling;
	if (next) {
		element.parentNode.insertBefore(toInsert, next);
	} else {
		element.parentNode.insert(toInsert);
	}
}

function build_dropdown(no_default, items, onchange) {
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


	div.appendChild(build_dropdown(true, actions, (event) => {
		let i = event.target.selectedIndex;
		console.log("show build call")
		show_build.call(build, i, true);
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
	let old = current_display;
	remove(current_display);
	current_display = undefined;
	return old;
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
	if (!link) {
		return;
	}
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
			if (i === undefined) {
				i = default_step(result);				
			}
			let url = result.steps[i].actions[0].output_url;
			let name = result.steps[i].name;
			// let url = build_result.actions[0].output_url;
			if (!url) {
				callback("   No log", url, result, name);
				return;
			}
			request(url, {
				success: (log) => {
					callback(log, url, result, name);
				},
				error: () => {
					callback("   Could not get output log for build " + build_id, "", {}, "");
				}
			})
		},
		error: () => {
			callback("   Could not get build info for build " + build_id, "", {}, "");
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