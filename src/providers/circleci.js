let CIRCLECI_TOKEN = undefined;

chrome.storage.local.get("config", (container) => {
  if (container.config) {
    CIRCLECI_TOKEN = container.config["CircleCI Token"];
  }
});

function show_build(action_index, merge_status_item) {
  // Check if we have a cached CircleCI API response
  if (merge_status_item && merge_status_item.hasAttribute("circleci_log_url")) {
    let result = JSON.parse(merge_status_item.getAttribute("circleci_log_url"));
    get_and_show_log.call(this, result, action_index);
    return;
  }

  if (!isSupported(this)) {
    get_and_show_log.call(this, { steps: [] }, -1, get_error_text(this));
    return;
  }

  circle_ci_request(this, {
    // If there's an old request for this build, quit it
    success: (result) => {
      result = JSON.parse(result);
      get_and_show_log.call(this, result, action_index);
    },
    error: (e) => {
      get_and_show_log.call(this, { steps: [] }, -1, get_error_text(this));
    },
  });
}

function show_failed_build_step(merge_status_item, build) {
  // Adds a 'circleci_result' attribute to the 'div.merge-status-item', which
  // lets fetch_log skip the redundant request to CircleCI
  let test_status = merge_status_item.querySelector("div.text-gray");

  // // 2nd child node is the text "— Your tests failed on CircleCI"
  circle_ci_request(build, {
    success: (api_response) => {
      api_response = JSON.parse(api_response);

      let last_step = latest_step_with_log(api_response);
      let log_url = api_response.steps[last_step].actions[0].output_url;

      let failed_span = document.createElement("span");
      failed_span.innerText = "— Your tests failed on CircleCI";

      let reason_span = document.createElement("span");
      reason_span.style["font-weight"] = "bold";
      reason_span.innerText = " (" + api_response.steps[last_step].name + ")";

      test_status.removeChild(test_status.childNodes[2]);
      test_status.appendChild(failed_span);
      test_status.appendChild(reason_span);

      let small_steps = [];
      for (let i = 0; i < api_response.steps.length; i++) {
        let url = api_response.steps[i].actions[0].output_url;
        small_steps.push({
          actions: [
            {
              output_url: url,
            },
          ],
          name: api_response.steps[i].name,
        });
      }
      let small_result = {
        steps: small_steps,
        lifecycle: api_response.lifecycle,
      };

      merge_status_item.setAttribute(
        "circleci_result",
        JSON.stringify(small_result)
      );
    },
    error: (e) => {
      console.error("CircleCI API request failed for", build.name);
      console.error(merge_status_item);
    },
  });
}

// Check the steps for the build steps that have run, grab the last one
// that has an "output_url" field
function latest_step_with_log(api_response) {
  let steps = api_response.steps;

  if (steps.length === 0) {
    return false;
  }

  // First try to find something with "test" as the name since that's
  // usually what has the actual failures
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].actions[0].output_url && steps[i].name == "Test") {
      return i;
    }
  }

  // If that's not there, just grab the last entry with a log
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].actions[0].output_url) {
      return i;
    }
  }
  return false;
}

function format_test_log(text) {
  // Highlight FAIL and ERROR lines red
  let regex = /(FAIL.*)|(ERROR.*)|(self\.assert.*)|([A-Za-z]*Error.*)/g;
  text = text.replace(regex, (str) => {
    return (
      "<span style='font-weight: bold;background-color: rgba(255, 40, 40, 0.2);padding: 1px 2px 1px 6px;'>" +
      str +
      "</span>"
    );
  });

  return text;
}

function circle_ci_request(build, options) {
  // If there's an old request for this build, quit it
  if (build_has_pending_request[build.name]) {
    build_has_pending_request[build.name].abort();
  }
  // console.log("Requesting ", build.info_url)
  let url = new URL(build.info_url);
  if (options.requires_token) {
    let token = get_circleci_token();
    if (!token) {
      options.error();
      return;
    }
    url.searchParams.append("circle-token", token);
  }
  let xhr = request(url.href, {
    success: (result) => {
      build_has_pending_request[build.name] = false;
      if (options.success) {
        options.success(result);
      }
    },
    error: (e) => {
      build_has_pending_request[build.name] = false;
      if (options.error) {
        options.error(e);
      }
    },
  });
  build_has_pending_request[build.name] = xhr;
}

// Get an HTML element that displays some text
function get_text_display(text) {
  let div = document.createElement("div");
  div.innerText = text;
  div.style.padding = "10px";
  div.style["background-color"] = "#ffd3d3";
  return div;
}

function get_circleci_token() {
  if (!CIRCLECI_TOKEN) {
    alert(
      "A CircleCI Token was not configured. Please add one in the GitHub CI Viewer extension settings and refresh the page."
    );
    return false;
  }
  return CIRCLECI_TOKEN;
}

class CircleCIItem {
  constructor(merge_status_item) {
    this.merge_status_item = merge_status_item;

    // Setup build-related information
    this.build = get_build(this.merge_status_item);
    let base = `https://circleci.com/api/v1.1/project/github/${this.build.username}/${this.build.repo}/${this.build.id}`;
    this.build.info_url = `${base}?circle-token=${CIRCLECI_TOKEN}`;
    this.build.retry_url = `${base}/retry?circle-token=${CIRCLECI_TOKEN}`;

    if (this.build.status === "failed") {
      show_failed_build_step(this.merge_status_item, this.build);
    }
  }

  _fetchLogAndBuildDisplay(selected_step, steps, callback) {
    let log_url = steps[selected_step].actions[0].output_url;
    request(log_url, {
      success: (log) => {
        // Process the log and get the div to display it in
        let container = this._buildDisplay(log, steps, selected_step);
        callback(container);
      },
      error: (error) => {
        let output = "Could not get output log for this step";
        callback(get_text_display(output));
      },
    });
  }

  retry(callback) {
    console.log("retrying");
    console.log(this);
    request(this.build.retry_url, {
      method: "POST",
      success: callback,
    });
  }

  _buildDisplay(output_log, steps, selected_step) {
    let container = document.createElement("div");
    let toolbar = document.createElement("div");

    // Fix up the newlines in the log so we can parse out the last N that we
    // want to show
    let processed_log = remove_newlines(output_log);

    // Add log content
    let log_scroll_view = new ScrollView(processed_log.trim(), format_test_log);

    // Retry build button
    // toolbar.appendChild(
    //   build_btn({
    //     text: "Retry build",
    //     click: () => {
    //       this.retry();
    //     },
    //   })
    // );

    let select_index = selected_step;
    let actions = steps.map((step, index) => {
      return {
        value: step.name,
        selected: index === selected_step,
      };
    });

    if (actions.length > 0) {
      // Add the text that shows what build step this is, something like
      //   Build step (x / x):
      let span = document.createElement("span");
      span.innerHTML =
        "Build step (<span id='build_curr'>0</span> / <span id='build_total'>0</span>): ";

      let total_span = span.querySelector("#build_total");
      let i_span = span.querySelector("#build_curr");

      total_span.innerText = actions.length;
      i_span.innerText = select_index + 1;

      toolbar.appendChild(span);

      // Add the dropdown menu with each build step
      toolbar.appendChild(
        build_dropdown(true, actions, (event) => {
          let new_selected_step = event.target.selectedIndex;
          // Grab the new log and display
          this._fetchLogAndBuildDisplay(
            new_selected_step,
            steps,
            (new_container) => {
              // Replace old output_pre with this one
              let parent = container.parentNode;
              parent.replaceChild(new_container, container);
              container = new_container;

              // TODO: refactor this so this doesn't need to be set manually
              container.setAttribute("id", "ci_viewer_display");
              // Tag it with the name so we can find it later if necessary
              container.setAttribute("ci_viewer_tag", this.build.name);
              current_display = container;
            }
          );
        })
      );
    }

    let grep_div = build_grep_action(log_scroll_view);
    toolbar.appendChild(grep_div);

    // Used for denoting when current_display has become stale
    let freshness = document.createElement("span");
    freshness.id = "circleci_viewer_freshness";
    freshness.style.color = "#7d7d00";
    freshness.style["font-weight"] = "bold";
    toolbar.appendChild(freshness);

    // Add log actions
    toolbar.classList.add("log-actions");
    container.appendChild(toolbar);

    // Add log data
    container.appendChild(log_scroll_view.element());
    return container;
  }

  // Generate some HTML content for this CI job, then pass it to callback to
  // handle showing it on the page
  getDisplay(callback) {
    let success = (api_response) => {
      api_response = JSON.parse(api_response);
      let selected_step = latest_step_with_log(api_response);

      // If no steps have output logs or no steps have run, don't do anything
      if (selected_step === false) {
        let output = "No build steps have run for build " + this.build.id;
        if (api_response.lifecycle) {
          output += " (status: " + result.lifecycle + ")";
        }
        callback(get_text_display(output));
        return;
      }

      // Download the log file and show
      this._fetchLogAndBuildDisplay(
        selected_step,
        api_response.steps,
        callback
      );
    };

    if (this.merge_status_item.hasAttribute("circleci_result")) {
      let attr = this.merge_status_item.getAttribute("circleci_result");
      success(attr);
      return;
    }

    // Call CircleCI API to get info about this build
    circle_ci_request(this.build, {
      success: success,
      error: (error) => {
        let output = "Could not get build info from CircleCI";
        callback(get_text_display(output));
      },
    });
  }
}
