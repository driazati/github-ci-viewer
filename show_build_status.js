let github_token = undefined;
chrome.storage.local.get('info', (items) => {
	github_token = items.info.github_token;
	progress_bar_main();
	document.addEventListener('pjax:end', progress_bar_main);
});

function parse_num(row) {
	let id = row.getAttribute('id');
	let matches = id.match(/\d+/g);
	return matches[0];
}

function add_bar(row, progress) {
	let build = row.querySelector('.commit-build-statuses a');
	let bar = progress_bar(progress);
	bar.setAttribute('style', 'margin-left: 4px');
	
	// remove old status indicators
	let container = row.querySelector('div.commit-build-statuses');
	container.innerHTML = "";
	container.appendChild(bar);
}

function progress_bar_main() {
	let rows = document.querySelectorAll('.js-issue-row');
	let builds = document.querySelectorAll('.commit-build-statuses a');
	if (rows.length == 0) {
		// if no builds found, try again 500 ms
		setTimeout(progress_bar_main, 500);
		return;
	}

	let nums = [];
	for (let i = 0; i < rows.length; ++i) {
		nums.push(parse_num(rows[i]));
	}

	for (let i = 0; i < rows.length; ++i) {
		let build = rows[i].querySelector('.commit-build-statuses a');
		if (!build) {
			setTimeout(progress_bar_main, 500);
			return;
		}
		let is_pending = build.classList.contains('bg-pending');
		let span = document.createElement('span');
		let progress = parse_progress(build.getAttribute('aria-label'));
		if (is_pending) {
			progress.pending = progress.total;
		}
		add_bar(rows[i], progress);
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
			let statuses = pr['commits']['nodes'][0]['commit']['status']['contexts'];
			let progress = {
				good: statuses.reduce((pre, curr) => (curr.state === "SUCCESS") ? ++pre : pre, 0),
				pending: statuses.reduce((pre, curr) => (curr.state === "PENDING") ? ++pre : pre, 0),
				total: statuses.length
			}
			add_bar(rows[i], progress);
		}
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

function progress_bar(progress) {
	let red = '#cb2431';
	let yellow = '#dbab09';
	let green = 'rgb(30, 206, 71)';

	let bar_width = 100;
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
		query += 'commits(last: 1) {nodes {commit {status {contexts {state}}}}}' + '\n';
		query += '}';
		return query;
    });

    let query = '{ repository(owner: "pytorch", name: "pytorch") {';
    query += pull_requests.join("\n");
    query += "} }";
    return query;
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
	req.setRequestHeader('Accept', 'application/json');
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