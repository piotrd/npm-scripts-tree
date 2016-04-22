"use strict"

const chalk = require("chalk")
// convention used : label and nodes
const archy = require("archy")

const BUILTINS = [
  "publish",
  "install",
  "uninstall",
  "test",
  "stop",
  "start",
  "restart",
  "version"
]

// -s, --serial…
const RE_FLAGS = "(?:\\s+\-+\\w+)*"
// build, watch, build_client, build-client, build:*
const RE_NAME = "\\s+([a-z0-9_\\-]+)"
const RE_NAMES = "((?:\\s+[a-z0-9_:\\-\\*]+)+)"

const PRE = "pre"
const POST = "post"

// utils

const unique = array => [...new Set(array)]

const flatten = arrays => [].concat.apply([], arrays)


function archify (scripts, alpha) {
  let names = Object.keys(scripts)
  if (alpha) {
    names = names.sort()
  }
  return {
    label: `${names.length} scripts`,
    nodes: names.map(n => scripts[n])
  }
}

function getLabel (script) {
  const name = script.isPre || script.isPost
    ? chalk.cyan(script.name)
    : chalk.bold(script.name)

  return name + chalk.dim(` — ${script.cmd}`)
}

function isLifeCycleScript (prefix, name, scripts) {
  const re = new RegExp("^" + prefix)
  const root = name.slice(prefix.length)
  return Boolean(name.match(re) && (scripts[root] || ~BUILTINS.indexOf(root)))
}

function getNodesNames (name, scripts) {
  const cmd = scripts[name]

  const nodesNames = [].concat(
    getRunScripts(cmd),
    getRunAllScripts(cmd)
  ).filter(x => x) // not null

  return getExistingNodeNames(unique(nodesNames), scripts)
}

function getExistingNodeNames (nodesNames, scripts) {
  return expandWildcard(nodesNames, scripts).filter(n => scripts[n])
}

function expandWildcard (nodesNames, scripts) {
  return flatten(nodesNames.map(n => {
    const sp = n.split(":")
    const star = sp.pop()
    if (star === "*" && sp.length === 1) {
      const name = sp[0]
      return Object.keys(scripts).filter(k =>  k.startsWith(`${name}:`))
    }
    return n
  }))
}

// handled natively
function getRunScripts (cmd) {
  const re = new RegExp("(?:npm run" + RE_NAME + ")+", "gi")
  const cmds = []
  let m
  // for each npm run group
  while ((m = re.exec(cmd)) !== null) {
    cmds.push(m[1])
  }

  return unique(cmds)
}

// handled by npm-run-all module
function getRunAllScripts (cmd) {
  const re = RegExp("(?:npm-run-all" + RE_FLAGS + RE_NAMES + ")+", "gi")
  const cmds = []
  let m
  // for each npm-run-all group
  while ((m = re.exec(cmd)) !== null) {
    // clean spaces
    cmds.push(m[1].trim().split(" ").filter(x => x))
  }

  return unique(flatten(cmds))
}

function getDetailedScripts (scripts) {
  return Object.keys(scripts).reduce((all, name) => {
    const s = {
      name: name,
      cmd: scripts[name],
      isPre: isLifeCycleScript(PRE, name, scripts),
      isPost: isLifeCycleScript(POST, name, scripts),
      pre: scripts[PRE + name],
      post: scripts[POST + name],
      nodesNames: getNodesNames(name, scripts)
    }
    s.label = getLabel(s)

    all[name] = s
    return all
  }, {})
}

// sub scripts
function attachNodes (scripts) {
  return Object.keys(scripts).reduce((all, name) => {
    const s = scripts[name]
    s.nodes = s.nodesNames.map(n => scripts[n])

    if (s.pre) s.nodes.unshift(scripts[PRE + name])
    if (s.post) s.nodes.push(scripts[POST + name])

    all[name] = s
    return all
  }, {})
}

function main (scripts, options) {
  if (!scripts) throw new Error("No package.json or no scripts key in this dir")

  let detailedScripts = getDetailedScripts(scripts)
  detailedScripts = attachNodes(detailedScripts)

  // sort?
  const alpha = options.a || options.alpha
  return archy(archify(detailedScripts, alpha))
}

module.exports = {
  main,
  // test
  getRunScripts,
  getRunAllScripts,
  getNodesNames
}
