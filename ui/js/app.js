pat = {}

pat.experiment = function(refreshRate) {

  function exports() {}

  exports.state = ko.observable("")
  exports.url = ko.observable("")
  exports.csvUrl = ko.observable("")
  exports.data = ko.observableArray()
  exports.config = { iterations: ko.observable(1), concurrency: ko.observable(1), interval: ko.observable(0), stop: ko.observable(0), cfTarget: ko.observable("http://xio.10.xx.xx.xx"), cfUsername: ko.observable("admin"), cfPassword: ko.observable("admin"), workloads: ko.observable("") }

  var timer = null

  exports.refresh = function() {
    $.get(exports.url(), function(data) {
      exports.data(data.Items.filter(function(d) { return d.Type === 0 }))
      exports.waitAndRefreshOnce()
    })
  }

  exports.refreshNow = function() {
    if(timer) { clearTimeout(timer) }
    exports.refresh()
  }

  exports.waitAndRefreshOnce = function() {
    timer = setTimeout(exports.refresh, refreshRate)
  }

  exports.run = function() {
    exports.state("running")
    exports.data([])		
    $.post( "/experiments/", { "iterations": exports.config.iterations(), "concurrency": exports.config.concurrency(), "interval": exports.config.interval(), "stop": exports.config.stop(),  "workload": WL.workloads() , "cfTarget": exports.config.cfTarget(), "cfUsername": exports.config.cfUsername(), "cfPassword": exports.config.cfPassword() }, function(data) {
			exports.url(data.Location)
			exports.csvUrl(data.CsvLocation)
			exports.refreshNow()
		})
  }

  exports.view = function(url) {
    exports.state("running")
    exports.url(url)
    exports.csvUrl("")
    exports.refreshNow()
  }

  exports.url.subscribe(function(u) {
    $(document).trigger("experimentChanged", u)
  })

  return exports
}

pat.experimentList = function() {
  var exports = {}

  var self = this
  var timer = null
  self.active = ko.observable()

  exports.experiments = ko.observable()
  exports.refresh = function() {
    $.get("/experiments/", function(data) {
      // fixme(jz) be better to do an append here, when server supports it
      data.Items.forEach(function(d) {
        d.active = ko.computed(function() { return self.active() == d.Location })
      })
      exports.experiments(data.Items.reverse())
      timer = setTimeout(exports.refresh, 1000 * 10)
    })
  }

  exports.refreshNow = function() {
    if(timer) { clearTimeout(timer) }
    exports.refresh()
  }

  $(document).on("experimentChanged", function(e, url) {
    self.active(url)
  })

  exports.refresh()

  return exports
}

ko.bindingHandlers.chart = {
  c: {},
  init: function(element, valueAccessor) {    
    ko.bindingHandlers.chart.b = d3_workload.init(element);
    ko.bindingHandlers.chart.t = d3_throughput.init(element);
  },
  update: function(element, valueAccessor) {
    var data = ko.unwrap(valueAccessor())
    data.forEach(function(obj) {
      for (k in obj) {
        if (k == "Average" || k == "WallTime" || k == "LastResult" || k == "TotalTime") obj[k + '_fmt'] = (obj[k] / 1000000000).toFixed(2) + " sec";
      }
    });
    ko.bindingHandlers.chart.b(data);
    ko.bindingHandlers.chart.t(data);
  }
}

pat.view = function(experimentList, experiment) {
  var self = this  

  var dom = new DOM();
  d3_workload.changeState(dom.showGraph)
  d3_throughput.changeState(dom.hideContent)

  this.workloadVisible = ko.observable(true)
  this.throughputVisible = ko.observable(false)

  WL = new patWorkload(document.getElementById("workloadItems"), document.getElementById("selectedList"), document.getElementById("argumentList"));
  WL.importKoBindingsVars("cfTarget", "targetHasError", "cfUsername", "usernameHasError", "cfPassword", "passwordHasError");

  this.redirectTo = function(location) { window.location = location }

  this.start = function() { experiment.run() }
  this.stop = function() { alert("Not implemented") }
  this.downloadCsv = function() { self.redirectTo(experiment.csvUrl()) }

  this.cfTarget = experiment.config.cfTarget
  this.targetHasError = ko.computed(function() { return WL.isArgumentError("rest:target", experiment.config.cfTarget()) } )  
  this.cfUsername = experiment.config.cfUsername
  this.usernameHasError = ko.computed(function() { return WL.isArgumentError("rest:username", experiment.config.cfUsername()) } )  
  this.cfPassword = experiment.config.cfPassword
  this.passwordHasError = ko.computed(function() { return WL.isArgumentError("rest:password", experiment.config.cfPassword()) })
  this.workloads = experiment.config.workloads
  WL.workloadsObservable(this.workloads)
  this.workloadListHasError = ko.computed(function() { return experiment.config.workloads() == "" })

  this.canStart = ko.computed(function() { return experiment.state() !== "running" })
  this.canStop = ko.computed(function() { return experiment.state() === "running" })
  this.canDownloadCsv = ko.computed(function() { return experiment.csvUrl() !== "" })
  this.noExperimentRunning = ko.computed(function() { return self.canStart() })
  this.numIterations = experiment.config.iterations
  this.numIterationsHasError = ko.computed(function() { return experiment.config.iterations() <= 0 })
  this.numConcurrent = experiment.config.concurrency
  this.numConcurrentHasError = ko.computed(function() { return experiment.config.concurrency() <= 0 })
  this.numInterval = experiment.config.interval
  this.numIntervalHasError = ko.computed(function() { return experiment.config.interval() < 0 })
  this.numStop = experiment.config.stop
  this.numStopHasError = ko.computed(function() { return experiment.config.stop() < 0 })
  this.formHasNoErrors = ko.computed(function() { return ! ( this.workloadListHasError() | this.targetHasError() | this.usernameHasError() | this.passwordHasError() | this.numIterationsHasError() | this.numConcurrentHasError() | this.numIntervalHasError() | this.numStopHasError() ) }, this)
  this.previousExperiments = experimentList.experiments
  this.data = experiment.data

  experiment.url.subscribe(function(url) {
    window.location.hash = "#" + url
  })

  experiment.state.subscribe(function() {
    experimentList.refreshNow()
  })

  this.onHashChange = function(hash) {
    if(hash.length > 1) {
      experiment.view(hash.slice(1));
    }
  }

  $(document).ready(function() { self.onHashChange(window.location.hash) })
  $(window).on('hashchange', function() { self.onHashChange(window.location.hash) })

  this.showWorkload = function() { d3_workload.changeState(dom.contentIn); updateVisibility(self.workloadVisible) }
  this.showThroughput = function() { d3_throughput.changeState(dom.contentIn); updateVisibility(self.throughputVisible) }

  function updateVisibility(ob) {
    self.workloadVisible(false)
    self.throughputVisible(false)
    ob(true)
  }
  
  
}
