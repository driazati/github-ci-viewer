'use strict'
let CIRCLECI_TOKEN = undefined;
let repo = undefined;
let username = undefined;
let log_lines = undefined;
let vcs = 'github';
let current_display = undefined;
let current_spinner = undefined;
let line_regex_default = undefined;
let high_signal_builds = undefined;

chrome.storage.local.get('info', (items) => {
	CIRCLECI_TOKEN = items.info.token;
	username = items.info.username;
	repo = items.info.repo;
	log_lines = items.info.num_lines;
	line_regex_default = items.info.regex_placeholder;
	high_signal_builds = items.info.high_signal_builds;

	if (high_signal_builds) {
		high_signal_builds = high_signal_builds.split("\n").map((item) => item.trim());
	} else {
		high_signal_builds = "";
	}
});

let build_has_pending_request = {};

function shouldDoNothing(event) {
	// If the user clicked on the 'Details' link, don't do anything
	return event.target.tagName.toLowerCase() === 'a';
}

function isCIStatusElement(merge_status_item) {
	// Check for the "Details" link on the element, if it's not there then it's
	// not a CI status 'div.merge-status-item'
	if (!merge_status_item) {
		return;
	}
	let is_status = false;
	merge_status_item.querySelectorAll('a').forEach((item) => {
		if (item.innerText === "Details") {
			is_status = true;
		}
	});

	return is_status;
}

function set_styles(merge_status_list) {
	// Show all the CI elements on the page
	merge_status_list.style['max-height'] = 'none';
}

function try_reattach_old_display(merge_status_list) {
	// Determine if current_display was just deleted
	if (!document.querySelector('#circleci_viewer_display') && current_display) {
		// Edit current display with 'maybe stale' warning
		current_display.querySelector('#circleci_viewer_freshness').classList.add("tooltip");
		current_display.querySelector('#circleci_viewer_freshness').innerHTML = "<span class='tooltiptext'>The build status has been updated, but this log has not been</span>";
		current_display.getAttribute('circleci_build_id');
	
		// Find build to put it on
		let new_build = get_builds(merge_status_list).find((build) => {
			return build.id === current_display.getAttribute('circleci_build_id');
		});
		if (!new_build) {
			console.error("Could not find build for old display");
			return;
		}
			
		// Re-add element to the DOM
		insert_after(new_build.element, current_display);
	}
}

function rerun_all_builds_click(event) {
	// Find failed builds
	let status_list_el = event.target.closest('div.branch-action-item').querySelector('.merge-status-list');
	let builds = get_builds(status_list_el);
	builds = builds.filter((build) => build.status === 'failed' && build.link.includes('circleci.com'));

	// Make sure before launching requests
	if (!confirm("Are you sure you want to re-run " + builds.length + " jobs?")) {
		return;
	}

	// Go to job retry url for each failed build
	let failed_builds_info = [];
	builds.forEach((build) => {
		retry_build(build, empty);
	});
}

let rerun_all_btn = undefined;
function add_rerun_failed_button(body) {
	let parent = body.parentNode;
	if (rerun_all_btn !== undefined) {
		// Get rid of old button
		remove(rerun_all_btn);
	}

	// Look for 'Hide all checks' link to find where to put the button
	let hide_all_checks = parent.querySelector('button.btn-link.float-right.js-details-target');
	if (!hide_all_checks) {
		console.error("No 'hide all checks' link in merge status list");
		return;
	}

	rerun_all_btn = build_btn({
		text: 'Rerun all failed CircleCI jobs',
		click: rerun_all_builds_click
	});

	// Set button styles
	rerun_all_btn.style.margin = '0px';
	rerun_all_btn.style['margin-left'] = '5px';

	rerun_all_btn.classList.add("circleci-viewer-rerun-all-btn");
	// Insert button to the left "hide_all_checks" text
	hide_all_checks.parentNode.appendChild(rerun_all_btn, hide_all_checks);
}

function per_page_actions(merge_status_list) {
	// These are run every time a merge_status_item is added to the page, so they
	// must be guarded to not happen multiple times
	set_styles(merge_status_list);

	// Add re-run failed builds
	add_rerun_failed_button(merge_status_list);

	// If there has been a refresh, find the old build of the current display and
	// put it back
	try_reattach_old_display(merge_status_list);
}


function find_and_add_merge_items(event) {
	// Find 'div.merge-status-items' without any context
	let lists = document.querySelectorAll('div.merge-status-list');
	let ci_list = find(lists, (list) => {
		let items = list.querySelectorAll('div.merge-status-item');

		return all_of(items, (item) => isCIStatusElement);
	});
	if (!ci_list) {
		return;
	}

	ci_list.querySelectorAll('div.merge-status-item').forEach(merge_status_item_added);
}


function merge_status_item_added(merge_status_item, recurse) {
	if (!isCIStatusElement(merge_status_item)) {
		// Not a CI build, don't do anything with it
		return;
	}

	// Set page styles, add rerun all build button
	per_page_actions(merge_status_item.closest('.merge-status-list'));

	if (merge_status_item.getAttribute('circle_ci_viewer_has_seen')) {
		// This one has already had a click event attached, ignore it
		return;
	}

	// For some reason some build items get skipped, so re-check the whole list
	// each time.
	// if (recurse) {
	// 	find_and_add_merge_items();		
	// }

	// Get build info and set up click event listener on item
	let build = get_build(merge_status_item);

	if (build.status === 'failed' && high_signal_builds.includes(build.name)) {
	// if (build.status === 'failed' && high_signal_builds.includes(build.name.trim())) {
		// Set red background for important build failure
		merge_status_item.style['background-color'] = '#ff000030';
	}

	if (isSupported(build) && build.status === 'failed') {
		// Show what build step failed
		show_failed_build_step(merge_status_item, build);
	}

	merge_status_item.addEventListener('click', (event) => {
		// If user clicks 'details', don't do anything
		if (shouldDoNothing(event)) {
			return;
		}

		let old_display = document.querySelector('#circleci_viewer_display');
		if (old_display) {
			if (old_display.previousSibling === merge_status_item) {
				// Collapse old display
				clear_current_display();
				return;				
			}
		}

		// Build log display and show
		show_build.call(build, undefined, undefined, merge_status_item);

	});

	merge_status_item.setAttribute('circle_ci_viewer_has_seen', true);

	// Make link have 'fullLogs=true' so that all build steps are shown
	let details_link = merge_status_item.querySelector('a.status-actions');
	let details_url = new URL(details_link.href);
	details_url.searchParams.set('fullLogs', 'true');
	details_link.href = details_url.href;
}

function circle_ci_request(build, obj) {
	if (build_has_pending_request[build.name]) {
		build_has_pending_request[build.name].abort();
	}
	let xhr = request(build_info_url(build.id), {
		success: (result) => {
			build_has_pending_request[build.name] = false;
			if (obj.success) {
				obj.success(result);
			}
		},
		error: (e) => {
			build_has_pending_request[build.name] = false;
			if (obj.error) {
				obj.error(e);
			}			
		}
	});
	build_has_pending_request[build.name] = xhr;
}

function show_failed_build_step(merge_status_item, build) {
	// Adds a 'circleci_result' attribute to the 'div.merge-status-item', which
	// lets fetch_log skip the redundant request to CircleCI
	let test_status = merge_status_item.querySelector('div.text-gray');

	// // 2nd child node is the text "— Your tests failed on CircleCI"
	circle_ci_request(build, {
		success: (result) => {
			result = JSON.parse(result);

			let last_step = default_step(result);
			let log_url = result.steps[last_step].actions[0].output_url;

			let failed_span = document.createElement('span');
			failed_span.innerText = "— Your tests failed on CircleCI";

			let reason_span = document.createElement('span');
			reason_span.style['font-weight'] = 'bold';
			reason_span.innerText = " (" + result.steps[last_step].name + ")";

			// let text = "— Your tests failed on CircleCI"
			// 	+ " (" + result.steps[last_step].name + ")";

			test_status.removeChild(test_status.childNodes[2]);
			test_status.appendChild(failed_span);
			test_status.appendChild(reason_span);
			// test_status.appendChild(document.createTextNode(text));

			let small_result = {
				steps: result.steps,
				lifecycle: result.lifecycle
			};

			merge_status_item.setAttribute('circleci_result', JSON.stringify(small_result));
		},
		error: (e) => {
			console.error("Could not get build info for:");
			console.error(merge_status_item);
		}
	});
}

function show_log(raw_log, steps, selected_step, is_err) {
	remove(current_spinner);
	remove(current_display);

	current_display = build_display(this, raw_log, steps, selected_step, is_err);
	current_display.setAttribute('circleci_build_id', this.id);
	current_display.scrollIntoView(true);
	current_display.id = 'circleci_viewer_display';
	insert_after(this.element, current_display);
}

function get_and_show_log(result, selected_step, error) {
	let show_this_log = show_log.bind(this);


	if (error) {
		show_this_log("    " + error, [], -1, true);
		return;
	}

	// If a particular build step is selected, use that. If not, use the
	// last one with an output log url
	if (selected_step === undefined) {
		selected_step = default_step(result);				
	}

	// If no steps have output logs or no steps have run, don't do anything
	if (selected_step === false || result.steps.length == 0) {
		let output = "No build steps have run for build " + this.id;
		if (result.lifecycle) {
			output += " (status: " + result.lifecycle + ")";				
		}
		show_this_log("    " + output, [], -1, true);
		return;
	}

	let log_url = result.steps[selected_step].actions[0].output_url;
	request(log_url, {
		success: (log) => {
			show_this_log(log, result.steps, selected_step, false);
		},
		error: () => {
			show_this_log("   Could not get output log for this step", result.steps, selected_step, true);
		}
	});
}


function show_build(action_index, is_updating, merge_status_item) {
	clear_current_display();
	// Remove 'Loading build ...' text if it's on the page
	remove(current_spinner);

	// Put up new loading text
	current_spinner = build_spinner(this);
	insert_after(this.element, current_spinner);


	if (merge_status_item && merge_status_item.hasAttribute('circleci_result')) {
		let result = JSON.parse(merge_status_item.getAttribute('circleci_result'));
		get_and_show_log.call(this, result, action_index);
		return;
	}

	if (!isSupported(this)) {
		get_and_show_log.call(this, {steps: []}, -1, get_error_text(this));
		return;
	}

	circle_ci_request(this, {
		success: (result) => {
			result = JSON.parse(result);
			get_and_show_log.call(this, result, action_index);
		},
		error: (e) => {
			get_and_show_log.call(this, {steps: []}, -1, get_error_text(this));
		}
	});
}

function build_display(build, raw_log, steps, selected_step, is_err) {
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

	let select_index = selected_step;
	let actions = steps.map((step, index) => {
		return {
			value: step.name,
			selected: index === selected_step
		};
	});

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

		// Grep log
		let grep_div = document.createElement("div");
		grep_div.classList.add("grep_div");
		let placeholder = line_regex_default || '';
		grep_div.innerHTML = "<span> Regex</span> <input id='log_grep' value='" + placeholder + "'>";
		grep_div.appendChild(build_btn({
				text: "Go",
				click: () => {
					const text = document.getElementById('log_grep').value;
					let out = undefined;
					if (text === '') {
						out = nFromEnd(processed_log, '\n', log_lines);
					} else {
						const lines = processed_log.split("\n");
						const regex = new RegExp(text);
						let out_lines = [];
						for (let i = 0; i < lines.length; i++) {
							if (regex.test(lines[i])) {
								out_lines.push(lines[i]);
							}
						}
						out = out_lines.join("\n");
					}

					pre.removeChild(pre.firstChild);
					pre.setAttribute('num_lines', NaN);
					let text_node = document.createTextNode(out);
					pre.appendChild(text_node);
				}
			}));
	    div.appendChild(grep_div);
	}

	// Used for denoting when current_display has become stale
	let freshness = document.createElement("span");
	freshness.id = 'circleci_viewer_freshness';
	freshness.style.color = '#7d7d00';
	freshness.style['font-weight'] = 'bold';
	div.appendChild(freshness);

	// Add log actions
	div.classList.add('log-actions');
	container.appendChild(div);

	let pre = document.createElement("pre");
	pre.setAttribute('num_lines', log_lines);
	pre.appendChild(document.createTextNode(nFromEnd(processed_log, '\n', log_lines)));
	pre.classList.add('log_viewer');

	// Add log content
	container.appendChild(pre);

	return container;
}

// function add_modal() {
// 	let div = document.createElement("div");

// 	div.innerHTML = `<p>Settings</p>
// 	<label>Number of tail lines</label>
// 	<input>
// 	<label>Previous lines increment</label>
// 	<input>
// 	<button id="modal_save">Save</button><button id="modal_save">Close</button>`;
// 	div.classList.add("circleci-viewer-modal");


// 	document.body.appendChild(div);
// }

function clear_current_display() {
	let old = current_display;
	remove(current_display);
	current_display = undefined;
	return old;
}

function retry_build(build, callback) {
	if (callback === undefined) {
		callback = clear_current_display;
	}
	request(build_retry_url(build.id), {
		method: "POST",
		success: callback
	});
}

function build_spinner(build) {
	let p = document.createElement("p");
	p.appendChild(document.createTextNode("Loading build " + build.id));
	return p;
}

function build_info_url(build_id) {
	return `https://circleci.com/api/v1.1/project/${vcs}/${username}/${repo}/${build_id}?circle-token=${CIRCLECI_TOKEN}`;
}

function build_retry_url(build_id) {
	return `https://circleci.com/api/v1.1/project/${vcs}/${username}/${repo}/${build_id}/ssh?circle-token=${CIRCLECI_TOKEN}`;
}

function nthFromEnd(str, pat, n) {
    let i = -1;
    let search_backward_from = str.length;
    while (n > 0) {
    	n -= 1;
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

function isSupported(build) {
	if (build.name.includes('travis-ci')) {
		return false;
	}
	if (build.link.includes("jenkins/")) {
		return false;
	}
	return true;
}

function get_error_text(build) {
	if (build.name.includes('travis-ci')) {
		return "Travis is not supported";
	}
	if (build.link.includes("jenkins/")) {
		return "Jenkins is not supported";
	}
	if (build.id) {
		return "Could not get build info for build " + build.id;
	} else {
		return "Could not get build id";
	}
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
	tail = tail.replace(/\\r\\n/g, '\n');
	tail = tail.replace(/(\\r)|(\\n)/g, '\n');
	return tail.replace(/\n\s*\n/g, '\n');
}

// GitHub status page is updated whenever GitHub feels like it and also on any
// ajax page loads (a 'pjax:end' DOM event), but this observer catches all of
// those
let observer = new MutationObserver(function(mutations) {
	mutations.forEach(function(mutation) {
		mutation.addedNodes.forEach((node) => {
			if (node.tagName && node.tagName == 'DIV') {
				// console.log(mutation);
			} else {
				return;
			}

			// Check if the added node itself is a 'div.merge-status-item'
			if (node.classList && node.classList.contains('merge-status-item')) {
				merge_status_item_added(node, /*recurse=*/true);
				return;
			}

			// Check if the added node contains any 'div.merge-status-item's
			let items = node
				.querySelectorAll('div.merge-status-item')
				.forEach((item) => merge_status_item_added(item, /*recurse=*/true));
		});
	});
});
observer.observe(document, {
    childList: true,
    subtree: true,
});

// Just in case, try to add the click events on any old document click or pjax load
document.addEventListener('pjax:end', find_and_add_merge_items);
document.addEventListener('click', find_and_add_merge_items);
