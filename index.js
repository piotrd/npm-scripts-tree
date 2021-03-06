"use strict"

const chalk = require("chalk")
// convention used in data tree: scripts, names and subs
// convention used in ASCII tree: label and nodes
const archy = require("archy")
const minimatch = require("minimatch")

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
const RE_NAME = "\\s+([a-z0-9_:\\-]+)"
const RE_NAMES = "((?:\\s+[a-z0-9_:\\-\\*]+)+)"

// minimatch conversion
const RE_COLON_OR_SLASH = /[:\/]/g
const SWAP_MAP = { ":": "/", "/": ":" }
const SEP = ":"

const PRE = "pre"
const POST = "post"

// utils

const unique = array => [...new Set(array)]

const flatten = arrays => [].concat.apply([], arrays)

const getMatches = (re, str) => {
  const matches = []
  let m
  while ((m = re.exec(str)) !== null) {
    matches.push({match: m[1], index: m[2]})
  }
  return matches
}

// minimatch conversion
const swapColonAndSlash = s => s.replace(RE_COLON_OR_SLASH, m => SWAP_MAP[m])

// label and nodes
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

// add color formatting
function getLabel (script) {
  let name = script.name
  if (script.isPre || script.isPost) {
    name = chalk.cyan(name)
  } else if (!script.isSub) {
    name = chalk.bold(name)
  }

  return name + chalk.dim(` — ${script.cmd}`)
}

// pre, post or builtins
function isLifeCycleScript (prefix, name, scripts) {
  const re = new RegExp("^" + prefix)
  const root = name.slice(prefix.length)
  return Boolean(name.match(re) && (scripts[root] || BUILTINS.includes(root)))
}

function getSubNames (name, scripts) {
  const cmd = scripts[name]

  const subNames = [].concat(
    getRunScripts(cmd),
    getRunAllScripts(cmd)
  ).filter(x => x) // not null

  return getExistingSubNames(unique(subNames), scripts)
}

function getExistingSubNames (names, scripts) {
  return expandWildcards(names, scripts).filter(n => scripts[n])
}

// test:* → [test:lint, test:client]
// test:** → [test:lint, test:client, test:client:fx]
function expandWildcard (name, scripts) {
  const n = swapColonAndSlash(name)
  return Object.keys(scripts)
    .map(swapColonAndSlash)
    .filter(x => minimatch(x, n))
    .map(swapColonAndSlash)
}

function expandWildcards (names, scripts) {
  return flatten(names.map(x => expandWildcard(x, scripts)))
}

// handled natively
function getRunScripts (cmd) {
  const re = new RegExp("(?:npm run" + RE_NAME + ")+", "gi")
  return unique(getMatches(re, cmd).map(m => m.match))
}

// handled by npm-run-all module
function getRunAllScripts (cmd) {
  const re = RegExp("(?:npm-run-all" + RE_FLAGS + RE_NAMES + ")+", "gi")
  const cmds = getMatches(re, cmd).map(m =>
    // clean spaces
    m.match.trim().split(" ").filter(x => x))

  return unique(flatten(cmds))
}

function gatherAllSubNames (scripts) {
  return unique(flatten(Object.keys(scripts).map(n => scripts[n].subNames)))
}

// 1st pass
function getDetailedScripts (scripts) {
  return Object.keys(scripts).reduce((all, name) => {
    all[name] = {
      name: name,
      cmd: scripts[name],
      // booleans
      isPre: isLifeCycleScript(PRE, name, scripts),
      isPost: isLifeCycleScript(POST, name, scripts),
      // refs
      pre: scripts[PRE + name],
      post: scripts[POST + name],
      // strings
      subNames: getSubNames(name, scripts)
    }
    return all
  }, {})
}

// 2nd pass
function attachLabelAndNodes (scripts) {
  const subNames = gatherAllSubNames(scripts)

  return Object.keys(scripts).reduce((all, name) => {
    const s = scripts[name]
    // for pruning and colors
    s.isSub = subNames.includes(name)
    s.isExplicitSub = s.isSub && name.includes(SEP)
    s.explicitSubLevel = name.split(SEP).length - 1
    // for archy
    s.label = getLabel(s)
    s.nodes = s.subNames.map(n => scripts[n])

    if (s.pre) s.nodes.unshift(scripts[PRE + name])
    if (s.post) s.nodes.push(scripts[POST + name])

    all[name] = s
    return all
  }, {})
}

// 3rd pass - TODO configurable pruning
function prune (scripts) {
  return Object.keys(scripts).reduce((all, name) => {
    const s = scripts[name]
    if (!s.isPre && !s.isPost && !s.isExplicitSub) {
      all[name] = s
    }
    return all
  }, {})
}

function main (scripts, options = {}) {
  if (!scripts) throw new Error("No package.json or no scripts key in this dir")

  let detailedScripts = getDetailedScripts(scripts)
  detailedScripts = attachLabelAndNodes(detailedScripts)
  if (options.p || options.prune) {
    detailedScripts = prune(detailedScripts)
  }

  // sort?
  const alpha = options.a || options.alpha
  return archy(archify(detailedScripts, alpha))
}

module.exports = {
  main,
  // test
  getRunScripts,
  getRunAllScripts,
  getSubNames,
  isLifeCycleScript,
  expandWildcard
}
