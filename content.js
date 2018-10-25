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
	let target = event.target.closest('div.branch-action-body div.merge-status-item');
	let body = event.target.closest('.merge-status-list');

	if (!target) {
		return;
	}

	if (!click_handled) {
		initialized = false;
		click_handled = true;
	}

	if (!initialized) {
		initialized = true;
		get_builds(body, (builds) => {
			builds.forEach((build) => {
				function build_click() {
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

function get_build_info(element) {
	let link = element.querySelector('.status-actions').href;
	return {
		link: link,
		id: get_build_id(link)
	};
}

function get_builds(body, callback) {
	let elements = body.querySelectorAll('.merge-status-item');
	body.style['max-height'] = 'none';

	let builds = [];

	for (let i = 0; i < elements.length; i++) {
		let el = elements[i];
		let link = el.querySelector('.status-actions').href;
		let id = get_build_id(link);
		// if (!id) {
		// 	// Not a valid build
		// 	continue;
		// }
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
	if (!is_updating && this.element.nextSibling === current_display) {
		clear_current_display();
		return;
	}
	clear_current_display();
	remove(current_spinner);

	current_spinner = build_spinner(this);
	insert_after(this.element, current_spinner);

	fetch_log(this.id, token, action_index, (raw_log, url, build_result, selected_step, is_err) => {
		remove(current_spinner);
		remove(current_display);

		current_display = build_display(this, raw_log, url, build_result, selected_step, is_err);
		current_display.scrollIntoView(true);
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

function build_display(build, raw_log, url, build_result, selected_step, is_err) {
	let container = document.createElement("div");
	let div = document.createElement("div");
	let processed_log = process_log(raw_log);
	if (!is_err) {
		let next_btn = build_btn({
			text: "Prev 20 lines",
			click: () => {
				pre.removeChild(pre.firstChild);
				let old_num_lines = parseInt(pre.getAttribute('num_lines'));
				let new_num_lines = old_num_lines + 20;
				pre.setAttribute('num_lines', new_num_lines);
				let text_node = document.createTextNode(nFromEnd(processed_log, '\n', new_num_lines));
				pre.appendChild(text_node);
			}
		});

		div.appendChild(build_btn({
			text: "View full log",
			click: () => {
				next_btn.parentNode.removeChild(next_btn);
				pre.removeChild(pre.firstChild);
				pre.setAttribute('num_lines', NaN);
				let text_node = document.createTextNode(processed_log);
				pre.appendChild(text_node);
			}
		}));

		div.appendChild(build_btn({
			text: "Retry build",
			click: () => {
				retry_build(build);
			}
		}));

		div.appendChild(next_btn);
	}

	let actions = [];
	let select_index = -1;

	if (build_result.steps) {
		build_result.steps.forEach((step, index) => {
			if (step.name === selected_step) {
				select_index = index;
			}
			actions.push({
				value: step.name,
				selected: step.name === selected_step
			});
		});
	}

	if (actions.length > 0) {
		let span = document.createElement("span");
		span.innerHTML = "Build step (<span id='build_curr'>0</span> / <span id='build_total'>0</span>): ";

		let total_span = span.querySelector("#build_total");
		let i_span = span.querySelector("#build_curr");

		total_span.innerText = actions.length;
		i_span.innerText = select_index + 1;

		div.appendChild(span);

		div.appendChild(build_dropdown(true, actions, (event) => {
			let i = event.target.selectedIndex;
			show_build.call(build, i, true);
		}));
	}

	let pre = document.createElement("pre");
	pre.setAttribute('num_lines', log_lines);
	pre.appendChild(document.createTextNode(nFromEnd(processed_log, '\n', log_lines)));
	pre.classList.add('log_viewer');
	container.appendChild(div);
	container.appendChild(pre);
	div.classList.add('log-actions');

	// add_modal();

	return container;
}

function add_modal() {
	let div = document.createElement("div");

	div.innerHTML = `<p>Settings</p>
	<label>Number of tail lines</label>
	<input>
	<label>Previous lines increment</label>
	<input>
	<button id="modal_save">Save</button><button id="modal_save">Close</button>`;
	div.classList.add("circleci-viewer-modal");



	document.body.appendChild(div);
}

function build_btn(opts) {
	let btn = document.createElement("button");
	btn.appendChild(document.createTextNode(opts.text));
	btn.addEventListener('click', opts.click);
	btn.style.margin = "5px";
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

function nFromEnd(str, pat, n) {
    let last_index = nthFromEnd(str, pat, n);
    return str.substring(last_index);
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
			if (i === false || result.steps.length == 0) {
				let output = "No build steps have run for build " + build_id;
				if (result.lifecycle) {
					output += " (status: " + result.lifecycle + ")";				
				}
				callback("    " + output, "", {}, "", true);
				return;
			}
			let url = result.steps[i].actions[0].output_url;
			let name = result.steps[i].name;
			// let url = build_result.actions[0].output_url;
			if (!url) {
				callback("   No output log url", url, result, name, true);
				return;
			}
			request(url, {
				success: (log) => {
					callback(log, url, result, name, false);
				},
				error: () => {
					callback("   Could not get output log for build " + build_id, "", {}, "", true);
				}
			})
		},
		error: (e) => {
			if (build_id) {
				callback("   Could not get build info for build " + build_id, "", {}, "", true);
			} else {
				callback("   Could not get build id", "", {}, "", true);
			}
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
	// if (!is_full) {
	// 	tail = tail.substring(nthFromEnd(tail, '\\n', log_lines));
	// 	tail = tail.substring(tail.indexOf('\\n', tail.length) + 3);
	// }
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
				// try {
					success(req.responseText);
				// } catch (e) {
					// error("Can't parse JSON: " + req.responseText);					
				// }
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