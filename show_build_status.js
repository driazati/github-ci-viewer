let github_token = undefined;
chrome.storage.local.get('info', (items) => {
	github_token = items.info.github_token;
	build_status_main();
	document.addEventListener('pjax:end', build_status_main);
});

function parse_num(row) {
	let id = row.getAttribute('id');
	let matches = id.match(/\d+/g);
	return matches[0];
}

function add_bar(row, progress, bar_width) {
	let build = row.querySelector('.commit-build-statuses a');
	let bar = progress_bar(progress, bar_width);
	bar.setAttribute('style', 'margin-left: 4px');
	
	// remove old status indicators
	let container = row.querySelector('div.commit-build-statuses');
	if (!container) {
		return false;
	}
	container.innerHTML = "";
	container.appendChild(bar);
	return true;
}

function add_bucketed_bars(row, pr) {

}

function add_diff_stat(row, pr) {
	let small_text_div = row.querySelector("div.mt-1.text-small");

	let additions = parseInt(pr['additions']);
	let deletions = parseInt(pr['deletions']);
	let changedFiles = parseInt(pr['changedFiles']);

	let div = document.createElement("div");
	div.style.display = "inline";
	div.innerHTML = `<span style="color: green">+${additions}</span> / <span style="color: red">-${deletions}</span> (${changedFiles})`;

	small_text_div.appendChild(div);
}

function add_mergable(row, pr) {
	let small_text_div = row.querySelector("div.mt-1.text-small");

	let div = document.createElement("div");
	div.style.display = "inline";
	if (pr['mergeable'] == 'MERGEABLE') {
		div.innerHTML = "✅"
	} else if (pr['mergeable'] == 'CONFLICTING') {
		div.innerHTML = "❗";
	} else {
		div.innerHTML = "❔";
	}



	small_text_div.appendChild(div);
}

function add_head_ref(row, pr) {
	let small_text_div = row.querySelector("div.mt-1.text-small");

	let div = document.createElement("div");
	div.style.display = "inline";
	div.style['margin-right'] = '8px';
	if (pr['headRef']) {
		div.innerText = pr['headRef']['name'];		
	}


	small_text_div.appendChild(div);
}

function add_phabricator_diff(row, pr) {
	let small_text_div = row.querySelector("div.mt-1.text-small");

	let a = document.createElement("a");

	let body = pr['bodyText'];
	let match = body.match(/D\d+/);
	if (!match) {
		return;
	}
	
	a.href = `https://our.internmc.facebook.com/intern/diff/${match}/`;
	a.innerText = match;
	a.style['margin-left'] = '6px';


	small_text_div.appendChild(a);
}

function build_status_main() {
	let rows = document.querySelectorAll('.js-issue-row');
	let builds = document.querySelectorAll('.commit-build-statuses a');

	let nums = [];
	for (let i = 0; i < rows.length; ++i) {
		nums.push(parse_num(rows[i]));
	}

	for (let i = 0; i < rows.length; ++i) {
		let build = rows[i].querySelector('.commit-build-statuses a');
		if (!build) {
			continue;
		}
		let is_pending = build.classList.contains('bg-pending');
		let span = document.createElement('span');
		let progress = parse_progress(build.getAttribute('aria-label'));
		if (is_pending) {
			progress.pending = progress.total;
		}
		add_bar(rows[i], progress, 100);

		let labels = rows[i].querySelectorAll("a.IssueLabel");
		iterable_map(labels, (label) => {
			let new_color = label.style['background-color']
				.replace(")", ", 0.5)")
				.replace("rgb", "rgba");
			label.style['background-color'] = new_color;
		})
	}

	if (!github_token) {
		// No auth, cant fetch from API
		console.error("Couldn't fetch real progress bars (no GitHub OAuth token)");
		return;
	}

	fetch_statuses(nums, (data) => {
		// got actual data, show real bars
		let results = data['data']['repository'];
		for (let i = 0; i < rows.length; ++i) {
			let pr = results['p' + nums[i]];
			let status = pr['commits']['nodes'][0]['commit']['status'];
			if (!status) {
				continue;
			}
			let statuses = status['contexts'];
			let progress = {
				good: statuses.reduce((pre, curr) => (curr.state === "SUCCESS") ? ++pre : pre, 0),
				pending: statuses.reduce((pre, curr) => (curr.state === "PENDING") ? ++pre : pre, 0),
				total: statuses.length
			}
			add_bar(rows[i], progress);
			add_buckets(rows[i], pr);
			add_mergable(rows[i], pr);
			add_head_ref(rows[i], pr);
			add_diff_stat(rows[i], pr);
			add_phabricator_diff(rows[i], pr);
		}

		// Add diff info
		// add_phabricator_diff_info();
	});
}

function parse_progress(text) {
	// should be like 11 / 20 checks OK
	let result = text.match(/(\d+)/gm);
	return {
		good: parseInt(result[0]),
		pending: 0, // no pending yet
		total: parseInt(result[1])
	};
}

function progress_bar(progress, bar_width) {
	let red = '#cb2431';
	let yellow = '#dbab09';
	let green = 'rgb(30, 206, 71)';

	let svg = make_node("svg", {width: bar_width, height: 10});
	let scaler = bar_width / progress.total;

	// red background
	let total = make_node('rect', {x: 0, y: 0, width: bar_width, height: 10});
	total.style.fill = red;
	svg.appendChild(total);

	// yellow pending
	let pending_width = (progress.good + progress.pending) * scaler;
	let pending = make_node('rect', {x: 0, y: 0, width: pending_width, height: 10});
	pending.style.fill = yellow;
	svg.appendChild(pending);

	// green progress
	let progress_width = progress.good * scaler;
	let progress_rect = make_node('rect', {x: 0, y: 0, width: progress_width, height: 10});
	progress_rect.style.fill = green;
	svg.appendChild(progress_rect);

	return svg;
}

function make_node(type, attrs) {
	let node = document.createElementNS("http://www.w3.org/2000/svg", type);
	for (var attr in attrs) {
		node.setAttributeNS(null, attr, attrs[attr]);
	}
	return node
}

function fetch_statuses(numbers, callback) {
	let url = 'https://api.github.com/graphql';
	let query = build_graphql_query(numbers);
	status_request(url, {
		body: JSON.stringify({query}),
		success: callback,
	});
}


function build_graphql_query(numbers) {
    let pull_requests = numbers.map((num) => {
		let query = `p${num}:pullRequest(number: ${num}) {`;
		query += 'id' + '\n';
		query += 'number' + '\n';
		query += 'title' + '\n';
		query += 'deletions' + '\n';
		query += 'additions' + '\n';
		query += 'bodyText' + '\n';
		query += 'changedFiles' + '\n';
		query += 'mergeable' + '\n';
		query += 'headRef {\nname\n}' + '\n';
		query += 'commits(last: 1) {nodes {commit {status {contexts {state\ncontext\n}}}}}' + '\n';
		query += '}';
		return query;
    });

    let query = '{ repository(owner: "pytorch", name: "pytorch") {';
    query += pull_requests.join("\n");
    query += "} }";
    return query;
}

function build_fb_graphql_query() {
	let query = `query get_pull_request($query: [PhabricatorDiffQueryParams!]!) {
phabricator_diff_query(query_params: $query) {
results {
nodes {
id,
opensource_github_pull_request {
  is_diff_stale
}
}
}
}
}`;
	return query;
}

function add_phabricator_diff_info() {
	console.log("Adding diff info")
	let query = build_fb_graphql_query();
	let data = {
		"0": {
			"numbers": [15232342, 15209004]
		}
	};
	// status_request('https://interngraph.intern.facebook.com/graphql/', {
	status_request('https://our.internmc.facebook.com/intern/api/graphql/', {
		body: JSON.stringify({
			"doc": query,
			"variables": JSON.stringify(data),
			// "oauth_token": fb_token
		}),
		success: (data) => {
			console.log("GOT ");
			console.log(data);
		},
		error: (req) => {
			console.log(req);
		},
		accept: 'text/html'
	});

}

function remove(element) {
	if (element && element.parentNode) {
		try {
			element.parentNode.removeChild(element);
		} catch (e) {

		}
	}
}

function status_request(url, opts) {
	const method = opts.method || 'POST';
	const body = opts.body || {};
	const success = opts.success || empty;
	const error = opts.error || empty;

	const req = new XMLHttpRequest();

	req.open(method, url);
	const accept = opts.accept || 'application/json';
	req.setRequestHeader('Accept', accept);
	req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	if (github_token) {
		req.setRequestHeader("Authorization", "bearer " + github_token);		
	}
	
	req.onreadystatechange = function() {
		if (req.readyState == 4) {
			if (req.status >= 200 && req.status < 300) {
				success(JSON.parse(req.responseText));
			} else {
				error(req);
			}
		}
	}
	
	req.onerror = function() {
		error();
	};

	if (body) {
		req.send(body);
	} else {
		req.send();
	}
}