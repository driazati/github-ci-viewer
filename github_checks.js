class GitHubChecksItem {
	constructor(merge_status_item) {
		this.merge_status_item = merge_status_item;
		this.build = get_build(this.merge_status_item);

		// The name of this specific job, i.e. for 'pytorch.pytorch (Python 3.7 Lint)'
		// it's "Python 3.7 Lint"
		let match = this.build.name.match(/\((.+)\)/);
		this.build.specific_name = match ? match[1] : undefined;


		let check_id = new URL(this.build.link).searchParams.get('check_run_id');
		this.checks_url = `https://api.github.com/repos/${this.build.username}/${this.build.repo}/check-runs/${check_id}`;
		console.log("made");
	}
	
	// Get a log from a Azure API response and pass a viewer to `callback`
	_fetchLogAndBuildDisplay(steps, callback) {
		if (steps.length > 1) {
			console.log("Too many steps");
			console.log(steps);
		}

		let step = steps[0];
		let log_url = step.log.url;

		chrome.runtime.sendMessage({
			ci_viewer_url: log_url
		}, (log) => {
			console.log(log_url)
			console.log(log)
			let container = this._buildDisplay(log, steps);
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
	// 1. Go to GitHub Checks API to get the Azure details
	// 2. Go to Azure to get the log URL
	// 3. Get the log output and format it
	getDisplay(callback) {
		if (this.build.specific_name === undefined) {
			let error = "Cannot get info for generic Azure job (try one of the other Azure jobs)";
			callback(get_text_display(error));
			return;
		}

		let success = (api_response) => {

			api_response = JSON.parse(api_response);

			let builds = [];
			let r = api_response.records;
			for (let i = 0; i < api_response.records.length; i++) {
				let item = api_response.records[i];
				if (item.name && item.type && item.type === "Job" && item.name.includes(this.build.specific_name)) {
					builds.push(item);
				}
			}

			// Download the log file and show
			this._fetchLogAndBuildDisplay(builds, callback);
		}

		let checks_success = (checks_response) => {
			console.log("checks_response");
			console.log(checks_response);
			// checks_response = JSON.parse(checks_response);
			// console.log(checks_response);
			// this.build.azure_url = checks_response.details_url;

			// let azure_url_base = this.build.azure_url.split('/_build')[0]
			// this.build.id = new URL(checks_response.details_url).searchParams.get('buildId');

			// this.build.info_url = `${azure_url_base}/_apis/build/builds/${this.build.id}/Timeline`;

			// chrome.runtime.sendMessage({
		 //    	ci_viewer_url: this.build.info_url
			// }, (response) => {
			// 	success(response);
			// });
		}

		// Check for cached result
		if (this.merge_status_item.hasAttribute('ci_result')) {
			let attr = this.merge_status_item.getAttribute('ci_result');
			success(attr);
			return;
		}

		// this.checks_url = 'https://github.com/pytorch/pytorch/commit/03f36444e60415cef413bbed0f952bcf0c7d49b1/checks/257332828/logs/3'
		// this.checks_url = 'https://api.github.com/repos/pytorch/pytorch/check-runs/424379835/annotations'
		this.checks_url = 'https://api.github.com/repos/pytorch/pytorch/check-runs/424379835'
		console.log(this.checks_url);
		chrome.runtime.sendMessage({
	    	ci_viewer_url: this.checks_url,
	    	options: {
	    		headers: {
	    			// GitHub requires this header for their checks API
	    			'Accept': 'application/vnd.github.antiope-preview+json'
	    		}
	    	}
		}, (response) => {
			checks_success(response);
		});
	}
}