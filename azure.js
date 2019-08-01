// function show_build(action_index, merge_status_item) {
// 	// Check if we have a cached CircleCI API response
// 	if (merge_status_item && merge_status_item.hasAttribute('circleci_log_url')) {
// 		let result = JSON.parse(merge_status_item.getAttribute('circleci_log_url'));
// 		get_and_show_log.call(this, result, action_index);
// 		return;
// 	}

// 	if (!isSupported(this)) {
// 		get_and_show_log.call(this, {steps: []}, -1, get_error_text(this));
// 		return;
// 	}

// 	circle_ci_request(this, {
// 		// If there's an old request for this build, quit it
// 		success: (result) => {
// 			result = JSON.parse(result);
// 			get_and_show_log.call(this, result, action_index);
// 		},
// 		error: (e) => {
// 			get_and_show_log.call(this, {steps: []}, -1, get_error_text(this));
// 		}
// 	});
// }

// function show_failed_build_step(merge_status_item, build) {
// 	// Adds a 'circleci_result' attribute to the 'div.merge-status-item', which
// 	// lets fetch_log skip the redundant request to CircleCI
// 	let test_status = merge_status_item.querySelector('div.text-gray');

// 	// // 2nd child node is the text "— Your tests failed on CircleCI"
// 	circle_ci_request(build, {
// 		success: (api_response) => {
// 			api_response = JSON.parse(api_response);

// 			let last_step = latest_step_with_log(api_response);
// 			let log_url = api_response.steps[last_step].actions[0].output_url;

// 			let failed_span = document.createElement('span');
// 			failed_span.innerText = "— Your tests failed on CircleCI";

// 			let reason_span = document.createElement('span');
// 			reason_span.style['font-weight'] = 'bold';
// 			reason_span.innerText = " (" + api_response.steps[last_step].name + ")";

// 			test_status.removeChild(test_status.childNodes[2]);
// 			test_status.appendChild(failed_span);
// 			test_status.appendChild(reason_span);

// 			let small_steps = [];
// 			for (let i = 0; i < api_response.steps.length; i++) {
// 				let url = api_response.steps[i].actions[0].output_url;
// 				small_steps.push({
// 					actions: [
// 						{
// 							output_url: url
// 						}
// 					],
// 					name: api_response.steps[i].name
// 				});
// 			}
// 			let small_result = {
// 				steps: small_steps,
// 				lifecycle: api_response.lifecycle
// 			};

// 			merge_status_item.setAttribute('circleci_result', JSON.stringify(small_result));
// 		},
// 		error: (e) => {
// 			console.error("CircleCI API request failed for", build.name);
// 			console.error(merge_status_item);
// 		}
// 	});
// }

// // Check the steps for the build steps that have run, grab the last one
// // that has an "output_url" field
// function latest_step_with_log(api_response) {
// 	let steps = api_response.steps;

// 	if (steps.length === 0) {
// 		return false;
// 	}

// 	for (let i = steps.length - 1; i >= 0; i--) {
// 		if (steps[i].actions[0].output_url) {
// 			return i;
// 		}
// 	}
// 	return false;
// }

// function format_test_log(text) {
// 	// Syntax highlight
// 	// let new_text = "";
// 	// text.split("\n").forEach(line => {
// 	// 	let match = line.match(/^([a-zA-Z]+ \d+ \d+:\d+:\d+ )(.*)/);
// 	// 	if (!match || match.length < 3)  {
// 	// 		new_text += "\n";
// 	// 		return;
// 	// 	}
// 	// 	let timestamp = match[1];
// 	// 	let rest = match[2];
// 	// 	new_text += timestamp + Prism.highlight(rest, Prism.languages.python, 'python');
// 	// 	new_text += "\n";
// 	// });
// 	// text = new_text;


// 	// Highlight FAIL and ERROR lines red
// 	let regex = /(FAIL.*)|(ERROR.*)|(self\.assert.*)|([A-Za-z]*Error.*)/g
// 	text = text.replace(regex, (str) => {
// 		return "<span style='font-weight: bold;background-color: rgba(255, 40, 40, 0.2);padding: 1px 2px 1px 6px;'>" + str + "</span>";
// 	});

// 	// Replace python error names with friendlier ones that can actually be copy-pasted
// 	// let test_regex = /((ERROR: )|(FAIL: ))([a-zA-Z0-9_]+) \([a-zA-Z0-9_]+\.([a-zA-Z0-9_]+)\)/g
// 	// text = text.replace(test_regex, (full_match, fail_type, something, something_else, test_name, module_name) => {
// 	// 	return fail_type + module_name + " " + test_name;
// 	// });

// 	return text;
// }

// function get_log_div(processed_log, log_lines) {
// 	let pre = document.createElement("div");
// 	pre.style['white-space'] = 'pre';
// 	pre.style['font-family'] = '"Lucida Console", Monaco, monospace';

// 	// Show the whole thing always, let browser scrolling handle pagination
// 	// stuff
// 	let shown_log = processed_log;
// 	// if (log_lines === false) {
// 	// 	// Show the entire thing
// 	// 	shown_log = processed_log;
// 	// } else {
// 	// 	// Only show `log_lines` from the tail
// 	// 	shown_log = nFromEnd(processed_log, '\n', log_lines);	
// 	// }
// 	shown_log = format_test_log(shown_log);

// 	pre.setAttribute('num_lines', log_lines);
// 	pre.style['overflow'] = 'scroll';
// 	pre.style['max-height'] = '80em';
// 	// pre.style['max-height'] = '800px';
// 	pre.innerHTML = shown_log.trim();
// 	pre.classList.add('log_viewer');

// 	return pre;
// }

// function circle_ci_request(build, options) {
// 	// If there's an old request for this build, quit it
// 	if (build_has_pending_request[build.name]) {
// 		build_has_pending_request[build.name].abort();
// 	}
// 	console.log("Requesting ", build.info_url)
// 	let xhr = request(build.info_url, {
// 		success: (result) => {
// 			build_has_pending_request[build.name] = false;
// 			if (options.success) {
// 				options.success(result);
// 			}
// 		},
// 		error: (e) => {
// 			build_has_pending_request[build.name] = false;
// 			if (options.error) {
// 				options.error(e);
// 			}			
// 		}
// 	});
// 	build_has_pending_request[build.name] = xhr;
// }

// // Get an HTML element that displays some text
// function get_text_display(text) {
// 	let div = document.createElement("div");
// 	div.innerText = text;
// 	return div;
// }

class AzureItem {
	constructor(merge_status_item) {
		this.merge_status_item = merge_status_item;

		// Setup build-related information
		this.build = get_build(this.merge_status_item);


		// this.name = merge_status_item.querySelector('')

		// get the thing in parentheses
		console.log(this.build.name)
		let match = this.build.name.match(/\(([a-zA-Z0-9\s]+)\)/);
		this.build.specific_name = match ? match[1] : '';


		let check_id = new URL(this.build.link).searchParams.get('check_run_id');
		this.checks_url = 'https://api.github.com/repos/pytorch/pytorch/check-runs/' + check_id;

		// something like 
		// https://dev.azure.com/pytorch/778b86d3-09b9-4636-a34b-315646862684/_build/results?buildId=2082
		// this.build.info_url = this.build.link + 'api/json';
		// this.build.retry_url = `https://circleci.com/api/v1.1/project/github/${this.build.username}/${this.build.repo}/${this.build.id}?circle-token=${CIRCLECI_TOKEN}`

		// if (this.build.status === 'failed') {
		// 	show_failed_build_step(this.merge_status_item, this.build);			
		// }
	}
	
	_fetchLogAndBuildDisplay(steps, callback) {
		if (steps.length > 1) {
			console.log("too many steps");
			console.log(steps);
		}

		let step = steps[0];
		let log_url = step.log.url;

		chrome.runtime.sendMessage({
	    	ci_viewer_url: log_url
		}, (log) => {
			let container = this._buildDisplay(log, steps);
			callback(container);
		});
	}

	retry(callback) {
		// console.log("retrying");
		// console.log(this);
		// request(this.build.retry_url, {
		// 	method: "POST",
		// 	success: callback
		// });

	}

	_buildDisplay(output_log, steps, selected_step) {
		let container = document.createElement("div");
		let toolbar = document.createElement("div");
		toolbar.style['padding-left'] = '10px';

		// Fix up the newlines in the log so we can parse out the last N that we
		// want to show
		let processed_log = remove_newlines(output_log);

		// Add log content
		let output_log_pre = get_log_div(processed_log, NUM_TAIL_LINES);

		// Retry build button
		// toolbar.appendChild(build_btn({
		// 	text: "Retry build",
		// 	click: () => { this.retry() }
		// }));

		let select_index = selected_step;
		console.log(steps)


		// Add regex search menu
		let grep_div = document.createElement("div");
		grep_div.classList.add("grep_div");
		grep_div.innerHTML = "<span style='margin-left: 4px;'>Regex</span> <input id='log_grep'>";
		grep_div.appendChild(build_btn({
				text: "Go",
				click: () => {
					const regex_text = document.getElementById('log_grep').value;
					let grepped_output_log = undefined;
					if (regex_text === '') {
						// No regex provided, go back to original log
						container.removeChild(output_log_pre);
						output_log_pre = get_log_div(processed_log, NUM_TAIL_LINES);
						container.appendChild(output_log_pre);
						return;
					} else {
						// Check each line of the full log to see if it matches,
						// if so add it and display it
						const lines = processed_log.split("\n");
						const regex = new RegExp(regex_text);
						let out_lines = [];
						for (let i = 0; i < lines.length; i++) {
							if (regex.test(lines[i])) {
								out_lines.push(lines[i]);
							}
						}
						grepped_output_log = out_lines.join("\n");
					}

					// Removing the existing text node and replace it with a
					// new one						
					output_log_pre.innerHTML = '';
					let text_node = document.createTextNode(grepped_output_log);
					output_log_pre.appendChild(text_node);

					output_log_pre.setAttribute('num_lines', NaN);
				}
			}));
	    toolbar.appendChild(grep_div);

		// Used for denoting when current_display has become stale
		let freshness = document.createElement("span");
		freshness.id = 'circleci_viewer_freshness';
		freshness.style.color = '#7d7d00';
		freshness.style['font-weight'] = 'bold';
		toolbar.appendChild(freshness);

		// Add log actions
		toolbar.classList.add('log-actions');
		container.appendChild(toolbar);

		// Add log data
		container.appendChild(output_log_pre);
		output_log_pre.scrollTop = output_log_pre.scrollHeight;
		return container;
	}

	// Generate some HTML content for this CI job, then pass it to callback to 
	// handle showing it on the page
	getDisplay(callback) {
		console.log("Getting display...");
		// Re-fetch the link, GitHub changes it from the check's one to an actual
		// azure link
		// this.build.link = this.merge_status_item.querySelectorAll('a')[1].href;
		// console.log(this.merge_status_item.querySelectorAll('a')[0].href)
		// console.log(this.merge_status_item.querySelectorAll('a')[1].href)
		// let link = this.merge_status_item.querySelectorAll('a')[1].href;
		// console.log(this.build.link)
		// this.build.id = new URL(this.build.link).searchParams.get('buildId');
		// console.log(this.build.id);
		console.log(this.build)
		console.log(this.build.link)
		// console.log(this.build.checks_url)
		// console.log(this.build.info_url)

		let success = (api_response) => {
			api_response = JSON.parse(api_response);
			console.log(api_response);

			let builds = [];
			for (let i = 0; i < api_response.records.length; i++) {
				let item = api_response.records[i];
				if (item.name && item.type && item.type === "Job" && item.name.includes(this.build.specific_name)) {
					builds.push(item);
				}
			}

			console.log(builds);

			// let builds = api_response.subBuilds;
			// if (builds.length == 0) {
			// 	callback(get_text_display("No build steps have run for this build"));
			// 	return;
			// }

			let selected_step = builds.length - 1;

			// Download the log file and show
			this._fetchLogAndBuildDisplay(builds, callback);
		}

		let checks_success = (checks_response) => {
			console.log(checks_response);
			checks_response = JSON.parse(checks_response);
			this.build.azure_url = checks_response.details_url;
			this.build.id = new URL(checks_response.details_url).searchParams.get('buildId');
			this.build.info_url = 'https://dev.azure.com/pytorch/778b86d3-09b9-4636-a34b-315646862684/_apis/build/builds/' + this.build.id + '/Timeline';

			chrome.runtime.sendMessage({
		    	ci_viewer_url: this.build.info_url
			}, (response) => {
				success(response);
				// success(response);
			});
		}

		if (this.merge_status_item.hasAttribute('circleci_result')) {
			let attr = this.merge_status_item.getAttribute('circleci_result');
			// console.log(attr)
			// let small_response = JSON.parse(attr);
			success(attr);
			return;
		}


		// Make web request
		chrome.runtime.sendMessage({
	    	ci_viewer_url: this.checks_url,
	    	// ci_viewer_url: this.build.info_url
	    	options: {
	    		headers: {
	    			'Accept': 'application/vnd.github.antiope-preview+json'
	    		}
	    	}
		}, (response) => {
			checks_success(response);
			// success(response);
		});
		// callback(get_text_display("dog"));

		// Call CircleCI API to get info about this build
		// circle_ci_request(this.build, {
		// 	success: success,
		// 	error: (error) => {
		// 		let output = "Could not get build info from CircleCI";
		// 		callback(get_text_display(output));
		// 	}
		// });
	}

	afterShowing(display) {
		console.log(display);
		console.log(display.querySelector('.log_viewer'));
		let output = display.querySelector('.log_viewer');
		output.scrollTop = output.scrollHeight;

	}
}