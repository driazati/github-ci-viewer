// Finds all logs on a GitHub Pull Request page, adds click events to expand and
// show details about the job

'use strict'

let current_display = undefined;
let current_spinner = undefined;

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
	if (!document.querySelector('#ci_viewer_display') && current_display) {
		let status_name = current_display.getAttribute('ci_viewer_tag').trim();
	
		// Find build to put it on
		let items = merge_status_list.querySelectorAll('.merge-status-item');
		let new_merge_item = undefined;
		for (let i = 0; i < items.length; i++) {
			let item = items[i];

			let item_name = item.querySelector('div [title] strong').innerText.trim();
			if (item_name == status_name) {
				// This is the one to reattach it to
				new_merge_item = item;
			} else {
				console.log("\tno match on ", item_name, " for ", status_name)
			}
		}

		if (!new_merge_item) {
			console.error("Could not find build for old display ", status_name);
			return;
		}
			
		// Re-add element to the DOM
		insert_after(new_merge_item, current_display);
		console.log("Re-attached...");

		// Edit current display with 'maybe stale' warning
		current_display.querySelector('#circleci_viewer_freshness').classList.add("tooltip");
		current_display.querySelector('#circleci_viewer_freshness').innerHTML = "<span class='tooltiptext'>The build status has been updated, but this log has not been</span>";
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
	// add_rerun_failed_button(merge_status_list);

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

	let has_seen = merge_status_item.getAttribute('circle_ci_viewer_has_seen');
	if (has_seen) {
		return;
	}


	// Get build info and set up click event listener on item
	let build = get_build(merge_status_item);

	let item = undefined;
	if (build.name.includes('ci/circleci')) {
		item = new CircleCIItem(merge_status_item);
	} else if (build.name.startsWith('pr/')) {
		item = new JenkinsItem(merge_status_item);
	} else if (build.name.startsWith('pytorch.pytorch')) {
		item = new AzureItem(merge_status_item);
	} else if (false && build.name.startsWith('Lint /')) {
		console.log("making status");
		item = new GitHubChecksItem(merge_status_item);
	} else {
		item = new UnsupportedItem(merge_status_item);
	}


	merge_status_item.addEventListener('click', (event) => {
		// If user clicks 'details', don't do anything
		if (shouldDoNothing(event)) {
			return;
		}

		let old_display = document.querySelector('#ci_viewer_display');
		if (old_display) {
			// If the same build is clicked twice, collapse it and don't do
			// anything else
			if (old_display.previousSibling === merge_status_item) {
				clear_current_display();
				return;				
			}
		}
		clear_current_display();

		// Remove 'Loading build ...' text if it's on the page
		remove(current_spinner);

		// Put up new loading text
		current_spinner = build_spinner(build);
		insert_after(merge_status_item, current_spinner);

		// This is the div with all the stuff for the log, now attach it
		item.getDisplay((display) => {
			// Done loading, remove the loading text
			remove(current_spinner);

			// Set display as global new display
			display.setAttribute('id', 'ci_viewer_display');
			// Tag it with the name so we can find it later if necessary
			display.setAttribute('ci_viewer_tag', build.name);
			current_display = display;

			insert_after(merge_status_item, display);
		});
	});

	merge_status_item.setAttribute('circle_ci_viewer_has_seen', true);

	let details_link = merge_status_item.querySelector('a.status-actions');
	let details_url = new URL(details_link.href);
}


function format_build_log(text) {
	return text;
}

function clear_current_display() {
	let old = current_display;
	remove(document.querySelector('#ci_viewer_display'));
	current_display = undefined;
	return old;
}

function retry_build(build, callback) {
	if (callback === undefined) {
		callback = clear_current_display;
	}
	request(build.retry_url, {
		method: "POST",
		success: callback
	});
}

function build_spinner(build) {
	let p = document.createElement("p");
	p.innerHTML = '<svg xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.0" width="104px" height="13px" viewBox="0 0 128 16" xml:space="preserve"><path fill="#f7af9d" fill-opacity="0.42" d="M6.4,4.8A3.2,3.2,0,1,1,3.2,8,3.2,3.2,0,0,1,6.4,4.8Zm12.8,0A3.2,3.2,0,1,1,16,8,3.2,3.2,0,0,1,19.2,4.8ZM32,4.8A3.2,3.2,0,1,1,28.8,8,3.2,3.2,0,0,1,32,4.8Zm12.8,0A3.2,3.2,0,1,1,41.6,8,3.2,3.2,0,0,1,44.8,4.8Zm12.8,0A3.2,3.2,0,1,1,54.4,8,3.2,3.2,0,0,1,57.6,4.8Zm12.8,0A3.2,3.2,0,1,1,67.2,8,3.2,3.2,0,0,1,70.4,4.8Zm12.8,0A3.2,3.2,0,1,1,80,8,3.2,3.2,0,0,1,83.2,4.8ZM96,4.8A3.2,3.2,0,1,1,92.8,8,3.2,3.2,0,0,1,96,4.8Zm12.8,0A3.2,3.2,0,1,1,105.6,8,3.2,3.2,0,0,1,108.8,4.8Zm12.8,0A3.2,3.2,0,1,1,118.4,8,3.2,3.2,0,0,1,121.6,4.8Z"/><g><path fill="#ed4115" fill-opacity="1" d="M-42.7,3.84A4.16,4.16,0,0,1-38.54,8a4.16,4.16,0,0,1-4.16,4.16A4.16,4.16,0,0,1-46.86,8,4.16,4.16,0,0,1-42.7,3.84Zm12.8-.64A4.8,4.8,0,0,1-25.1,8a4.8,4.8,0,0,1-4.8,4.8A4.8,4.8,0,0,1-34.7,8,4.8,4.8,0,0,1-29.9,3.2Zm12.8-.64A5.44,5.44,0,0,1-11.66,8a5.44,5.44,0,0,1-5.44,5.44A5.44,5.44,0,0,1-22.54,8,5.44,5.44,0,0,1-17.1,2.56Z"/><animateTransform attributeName="transform" type="translate" values="23 0;36 0;49 0;62 0;74.5 0;87.5 0;100 0;113 0;125.5 0;138.5 0;151.5 0;164.5 0;178 0" calcMode="discrete" dur="1170ms" repeatCount="indefinite"/></g></svg>';
	p.style.padding = "5px";
	p.style['text-align'] = "center";
	return p;
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
	return build.name.includes('circleci');
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

function remove_newlines(raw, is_full) {
	// Cleanup all carriage return-containing newlines to be UNIX style
	let tail = raw.replace(/\/r/, '');
	tail = tail.replace(/\\r\\n/g, '\n');
	tail = tail.replace(/(\\r)|(\\n)/g, '\n');

	// Replace blank lines with just 1 newline
	return tail.replace(/\n\s*\n/g, '\n');
}

// GitHub status page is updated whenever GitHub feels like it and also on any
// ajax page loads (a 'pjax:end' DOM event), but this observer catches all of
// those
const pr_page_url_regex = new RegExp(/github\.com\/.*\/.*\/pull\/\d+/);
let observer = new MutationObserver(function(mutations) {
	// console.log("NEW MUTATION");
	if (!window.location.href.match(pr_page_url_regex)) {
		return;
	}
	for (let i = 0; i < mutations.length; i++) {
		let mutation = mutations[i];
		for (let j = 0; j < mutation.addedNodes.length; j++) {
			let node = mutation.addedNodes[j];
			// Not a valid div, give up
			if (!node.tagName || node.tagName != 'DIV') {
				continue;
			}
			if (node.id === 'partial-pull-merging') {
				let items = node.querySelectorAll('div.merge-status-item');
				for (let k = 0; k < items.length; k++) {
					merge_status_item_added(items[k]);
				}
			} else if (node.classList && node.classList.contains('merge-status-item')) {
				merge_status_item_added(node);
			} else {
				let items = node.querySelectorAll('div.merge-status-item');
				for (let k = 0; k < items.length; k++) {
					merge_status_item_added(items[k]);
				}
			}
		}
	}
});

observer.observe(document, {
    childList: true,
    subtree: true,
});

// Just in case, try to add the click events on any old document click or pjax load
document.addEventListener('pjax:end', find_and_add_merge_items);
document.addEventListener('click', find_and_add_merge_items);
