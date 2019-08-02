function build_grep_action(log_scroll_view) {
	let grep_div = document.createElement("div");
	grep_div.classList.add("grep_div");
	grep_div.innerHTML = "<span style='margin-left: 4px;'>Regex</span> <input id='log_grep'>";
	grep_div.appendChild(build_btn({
			text: "Go",
			click: () => { log_scroll_view.grep(grep_div.querySelector('#log_grep').value); }
	}));
	return grep_div;
}

class JenkinsItem {
	constructor(merge_status_item) {
		this.merge_status_item = merge_status_item;

		// Setup build-related information
		this.build = get_build(this.merge_status_item);
		this.build.info_url = this.build.link + 'api/json';
	}
	
	_fetchLogAndBuildDisplay(selected_step, steps, callback) {
		let base = "https://ci.pytorch.org/jenkins/";
		let log_url = base + steps[selected_step].url + "consoleText";


		chrome.runtime.sendMessage({
	    	ci_viewer_url: log_url
		}, (log) => {
			let container = this._buildDisplay(log, steps, selected_step);
			callback(container);
		});
	}

	retry(callback) {
		console.error("Not supported");
	}

	_buildDisplay(output_log, steps, selected_step) {
		let container = document.createElement("div");
		let toolbar = document.createElement("div");
		toolbar.style['padding-left'] = '10px';

		// Fix up the newlines in the log so we can parse out the last N that we
		// want to show
		let processed_log = remove_newlines(output_log);

		// Add log content
		let log_scroll_view = new ScrollView(processed_log.trim(), format_test_log);

		let select_index = selected_step;
		console.log(steps)
		let actions = steps.map((step, index) => {
			console.log(step);
			let status = "<?>"
			if (step.result === "SUCCESS") {
				status = "[passed]";
			} else if (step.result === "FAILURE") {
				status = "[failed]"
			}
			let name = status + " " + step.jobName;
			return {
				value: name,
				selected: index === selected_step
			};
		});

		if (actions.length > 0) {
			// Add the text that shows what build step this is, something like
			//   Build step (x / x):
			let span = document.createElement("span");
			span.innerHTML = "Build step (<span id='build_curr'>0</span> / <span id='build_total'>0</span>): ";

			let total_span = span.querySelector("#build_total");
			let i_span = span.querySelector("#build_curr");

			total_span.innerText = actions.length;
			i_span.innerText = select_index + 1;

			toolbar.appendChild(span);

			// Add the dropdown menu with each build step
			toolbar.appendChild(build_dropdown(true, actions, (event) => {
				let new_selected_step = event.target.selectedIndex;
				// Grab the new log and display
				this._fetchLogAndBuildDisplay(new_selected_step, steps, (new_container) => {
					// Replace old output_pre with this one
					let parent = container.parentNode;
					parent.replaceChild(new_container, container);
					container = new_container;
					this.afterShowing(container);
				});
			}));
		}

		// Add regex search menu
		let grep_div = build_grep_action(log_scroll_view);
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
		container.appendChild(log_scroll_view.element());
		return container;
	}

	// Generate some HTML content for this CI job, then pass it to callback to 
	// handle showing it on the page
	getDisplay(callback) {
		console.log("Getting display...");

		let success = (api_response) => {
			api_response = JSON.parse(api_response);
			// console.log(api_response)

			let builds = api_response.subBuilds;
			if (builds.length == 0) {
				callback(get_text_display("No build steps have run for this build"));
				return;
			}

			let selected_step = builds.length - 1;

			// Download the log file and show
			this._fetchLogAndBuildDisplay(selected_step, builds, callback);
		}

		if (this.merge_status_item.hasAttribute('circleci_result')) {
			let attr = this.merge_status_item.getAttribute('circleci_result');
			success(attr);
			return;
		}


		// Make web request
		chrome.runtime.sendMessage({
	    	ci_viewer_url: this.build.info_url
		}, (response) => {
			success(response);
		});
	}
}