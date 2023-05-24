import { parseJSON, traverseNodes, getStaticJSONValue } from 'jsonc-eslint-parser';
import { isBoolean, format, escapeHtml, friendlyJSONstringify, isString, isNumber } from '@intlify/shared';
import module from 'node:module';
import { SourceMapGenerator, SourceMapConsumer } from 'source-map';
import MagicString from 'magic-string';
import { parseYAML, traverseNodes as traverseNodes$1, getStaticYAMLValue } from 'yaml-eslint-parser';
import { parse } from 'acorn';
import { generate as generate$3 } from 'escodegen';
import { walk } from 'estree-walker';

const require = module.createRequire(import.meta.url);
const {
  baseCompile,
  detectHtmlTag,
  LocationStub
} = require("@intlify/message-compiler");
function createCodeGenerator(options = {
  filename: "bundle.json",
  sourceMap: false,
  env: "development",
  forceStringify: false
}) {
  const { sourceMap, source, filename } = options;
  const _context = Object.assign(
    {
      code: "",
      column: 1,
      line: 1,
      offset: 0,
      map: void 0,
      indentLevel: 0
    },
    options
  );
  const context = () => _context;
  function push(code, node, name) {
    _context.code += code;
    if (_context.map && node) {
      if (node.loc && node.loc !== LocationStub) {
        addMapping(node.loc.start, name);
      }
      advancePositionWithSource(_context, code);
    }
  }
  function _newline(n) {
    push("\n" + `  `.repeat(n));
  }
  function indent(withNewLine = true) {
    const level = ++_context.indentLevel;
    withNewLine && _newline(level);
  }
  function deindent(withNewLine = true) {
    const level = --_context.indentLevel;
    withNewLine && _newline(level);
  }
  function newline() {
    _newline(_context.indentLevel);
  }
  function pushline(code, node, name) {
    push(code, node, name);
    newline();
  }
  function addMapping(loc, name) {
    _context.map.addMapping({
      name,
      source: _context.filename,
      original: {
        line: loc.line,
        column: loc.column - 1
      },
      generated: {
        line: _context.line,
        column: _context.column - 1
      }
    });
  }
  if (sourceMap && source) {
    _context.map = new SourceMapGenerator();
    _context.map.setSourceContent(filename, source);
  }
  return {
    context,
    push,
    indent,
    deindent,
    newline,
    pushline
  };
}
function advancePositionWithSource(pos, source, numberOfCharacters = source.length) {
  if (pos.offset == null) {
    return pos;
  }
  let linesCount = 0;
  let lastNewLinePos = -1;
  for (let i = 0; i < numberOfCharacters; i++) {
    if (source.charCodeAt(i) === 10) {
      linesCount++;
      lastNewLinePos = i;
    }
  }
  pos.offset += numberOfCharacters;
  pos.line += linesCount;
  pos.column = lastNewLinePos === -1 ? pos.column + numberOfCharacters : numberOfCharacters - lastNewLinePos;
  return pos;
}
const DETECT_MESSAGE = `Detected HTML in '{msg}' message.`;
const ON_ERROR_NOOP = () => {
};
function parsePath(path) {
  return path ? path.join(".") : "";
}
function generateMessageFunction(msg, options, path) {
  const env = options.env != null ? options.env : "development";
  const strictMessage = isBoolean(options.strictMessage) ? options.strictMessage : true;
  const escapeHtml$1 = !!options.escapeHtml;
  const onError = options.onError || ON_ERROR_NOOP;
  const errors = [];
  let detecteHtmlInMsg = false;
  if (detectHtmlTag(msg)) {
    detecteHtmlInMsg = true;
    if (strictMessage) {
      const errMsg = format(DETECT_MESSAGE, { msg });
      onError(format(errMsg), {
        source: msg,
        path: parsePath(path)
      });
    }
  }
  const _msg = detecteHtmlInMsg && escapeHtml$1 ? escapeHtml(msg) : msg;
  const newOptions = Object.assign({ mode: "arrow" }, options);
  newOptions.onError = (err) => {
    if (onError) {
      const extra = {
        source: msg,
        path: parsePath(path),
        code: err.code,
        domain: err.domain,
        location: err.location
      };
      onError(err.message, extra);
      errors.push(err);
    }
  };
  const { code, ast, map } = baseCompile(_msg, newOptions);
  const occured = errors.length > 0;
  const genCode = !occured ? env === "development" ? `(()=>{const fn=${code};fn.source=${JSON.stringify(msg)};return fn;})()` : `${code}` : _msg;
  return { code: genCode, ast, map, errors };
}
function mapLinesColumns(resMap, codeMaps, inSourceMap) {
  if (!resMap) {
    return null;
  }
  const resMapConsumer = new SourceMapConsumer(resMap);
  const inMapConsumer = inSourceMap ? new SourceMapConsumer(inSourceMap) : null;
  const mergedMapGenerator = new SourceMapGenerator();
  let inMapFirstItem = null;
  if (inMapConsumer) {
    inMapConsumer.eachMapping((m) => {
      if (inMapFirstItem) {
        return;
      }
      inMapFirstItem = m;
    });
  }
  resMapConsumer.eachMapping((res) => {
    if (res.originalLine == null) {
      return;
    }
    const map = codeMaps.get(res.name);
    if (!map) {
      return;
    }
    let inMapOrigin = null;
    if (inMapConsumer) {
      inMapOrigin = inMapConsumer.originalPositionFor({
        line: res.originalLine,
        column: res.originalColumn - 1
      });
      if (inMapOrigin.source == null) {
        inMapOrigin = null;
        return;
      }
    }
    const mapConsumer = new SourceMapConsumer(map);
    mapConsumer.eachMapping((m) => {
      mergedMapGenerator.addMapping({
        original: {
          line: inMapFirstItem ? inMapFirstItem.originalLine + res.originalLine - 2 : res.originalLine,
          column: inMapFirstItem ? inMapFirstItem.originalColumn + res.originalColumn : res.originalColumn
        },
        generated: {
          line: inMapFirstItem ? inMapFirstItem.generatedLine + res.originalLine - 2 : res.originalLine,
          // map column with message format compilation code map
          column: inMapFirstItem ? inMapFirstItem.generatedColumn + res.originalColumn + m.generatedColumn : res.originalColumn + m.generatedColumn
        },
        source: inMapOrigin ? inMapOrigin.source : res.source,
        name: m.name
        // message format compilation code
      });
    });
  });
  const generator = mergedMapGenerator;
  const targetConsumer = inMapConsumer || resMapConsumer;
  targetConsumer.sources.forEach((sourceFile) => {
    generator._sources.add(sourceFile);
    const sourceContent = targetConsumer.sourceContentFor(sourceFile);
    if (sourceContent != null) {
      mergedMapGenerator.setSourceContent(sourceFile, sourceContent);
    }
  });
  generator._sourceRoot = inSourceMap ? inSourceMap.sourceRoot : resMap.sourceRoot;
  generator._file = inSourceMap ? inSourceMap.file : resMap.file;
  return generator.toJSON();
}

function generateLegacyCode({ isGlobal }, generator) {
  const componentNamespace = `Component.options`;
  const variableName = !isGlobal ? "__i18n" : "__i18nGlobal";
  const exportSyntax = "export default";
  const code = `${exportSyntax} function (Component) {
  ${componentNamespace}.${variableName} = ${componentNamespace}.${variableName} || []
  ${componentNamespace}.${variableName}.push(${friendlyJSONstringify(
    generator()
  )})
  delete ${componentNamespace}._Ctor
}`;
  return code;
}

function generate$2(targetSource, {
  type = "plain",
  legacy = false,
  bridge = false,
  exportESM = false,
  filename = "vue-i18n-loader.json",
  inSourceMap = void 0,
  locale = "",
  isGlobal = false,
  sourceMap = false,
  env = "development",
  forceStringify = false,
  onError = void 0,
  strictMessage = true,
  escapeHtml = false,
  useClassComponent = false
}, injector) {
  const target = Buffer.isBuffer(targetSource) ? targetSource.toString() : targetSource;
  const value = target;
  const options = {
    type,
    bridge,
    exportESM,
    source: value,
    sourceMap,
    locale,
    isGlobal,
    inSourceMap,
    env,
    filename,
    forceStringify,
    onError,
    strictMessage,
    escapeHtml,
    useClassComponent
  };
  const generator = createCodeGenerator(options);
  const ast = parseJSON(value, { filePath: filename });
  if (legacy && type === "sfc") {
    const gen = () => friendlyJSONstringify(getStaticJSONValue(ast));
    const code2 = generateLegacyCode(options, gen);
    const s = new MagicString(code2);
    return {
      ast,
      code: s.toString(),
      map: s.generateMap({
        file: filename,
        source: value,
        includeContent: true
      })
    };
  }
  const codeMaps = generateNode$2(generator, ast, options, injector);
  const { code, map } = generator.context();
  const newMap = map ? mapLinesColumns(map.toJSON(), codeMaps, inSourceMap) || null : null;
  return {
    ast,
    code,
    map: newMap != null ? newMap : void 0
  };
}
function generateNode$2(generator, node, options, injector) {
  const propsCountStack = [];
  const pathStack = [];
  const itemsCountStack = [];
  const { forceStringify } = generator.context();
  const codeMaps = /* @__PURE__ */ new Map();
  const {
    type,
    bridge,
    exportESM,
    sourceMap,
    isGlobal,
    locale,
    useClassComponent
  } = options;
  const componentNamespace = "_Component";
  traverseNodes(node, {
    enterNode(node2, parent) {
      switch (node2.type) {
        case "Program":
          if (type === "plain") {
            generator.push(`const resource = `);
          } else if (type === "sfc") {
            const variableName = type === "sfc" ? !isGlobal ? "__i18n" : "__i18nGlobal" : "";
            const localeName = type === "sfc" ? locale != null ? locale : `""` : "";
            const exportSyntax = bridge ? exportESM ? `export default` : `module.exports =` : `export default`;
            generator.push(`${exportSyntax} function (Component) {`);
            generator.indent();
            const componentVariable = bridge ? `Component.options || Component` : useClassComponent ? `Component.__o || Component.__vfdConstructor || Component` : `Component`;
            generator.pushline(`const ${componentNamespace} = ${componentVariable}`);
            generator.pushline(
              `${componentNamespace}.${variableName} = ${componentNamespace}.${variableName} || []`
            );
            generator.push(`${componentNamespace}.${variableName}.push({`);
            generator.indent();
            generator.pushline(`"locale": ${JSON.stringify(localeName)},`);
            generator.push(`"resource": `);
          }
          break;
        case "JSONObjectExpression":
          generator.push(`{`);
          generator.indent();
          propsCountStack.push(node2.properties.length);
          if (parent.type === "JSONArrayExpression") {
            const lastIndex2 = itemsCountStack.length - 1;
            const currentCount = parent.elements.length - itemsCountStack[lastIndex2];
            pathStack.push(currentCount.toString());
            itemsCountStack[lastIndex2] = --itemsCountStack[lastIndex2];
          }
          break;
        case "JSONProperty":
          if (node2.value.type === "JSONLiteral" && (node2.key.type === "JSONLiteral" || node2.key.type === "JSONIdentifier")) {
            const name = node2.key.type === "JSONLiteral" ? node2.key.value : node2.key.name;
            const value = node2.value.value;
            if (isString(value)) {
              generator.push(`${JSON.stringify(name)}: `);
              pathStack.push(name.toString());
              const { code, map } = generateMessageFunction(
                value,
                options,
                pathStack
              );
              sourceMap && map != null && codeMaps.set(value, map);
              generator.push(`${code}`, node2.value, value);
            } else {
              if (forceStringify) {
                const strValue = JSON.stringify(value);
                generator.push(`${JSON.stringify(name)}: `);
                pathStack.push(name.toString());
                const { code, map } = generateMessageFunction(
                  strValue,
                  options,
                  pathStack
                );
                sourceMap && map != null && codeMaps.set(strValue, map);
                generator.push(`${code}`, node2.value, strValue);
              } else {
                generator.push(
                  `${JSON.stringify(name)}: ${JSON.stringify(value)}`
                );
                pathStack.push(name.toString());
              }
            }
          } else if ((node2.value.type === "JSONObjectExpression" || node2.value.type === "JSONArrayExpression") && (node2.key.type === "JSONLiteral" || node2.key.type === "JSONIdentifier")) {
            const name = node2.key.type === "JSONLiteral" ? node2.key.value : node2.key.name;
            generator.push(`${JSON.stringify(name)}: `);
            pathStack.push(name.toString());
          }
          const lastIndex = propsCountStack.length - 1;
          propsCountStack[lastIndex] = --propsCountStack[lastIndex];
          break;
        case "JSONArrayExpression":
          generator.push(`[`);
          generator.indent();
          if (parent.type === "JSONArrayExpression") {
            const lastIndex2 = itemsCountStack.length - 1;
            const currentCount = parent.elements.length - itemsCountStack[lastIndex2];
            pathStack.push(currentCount.toString());
            itemsCountStack[lastIndex2] = --itemsCountStack[lastIndex2];
          }
          itemsCountStack.push(node2.elements.length);
          break;
        case "JSONLiteral":
          if (parent.type === "JSONArrayExpression") {
            const lastIndex2 = itemsCountStack.length - 1;
            const currentCount = parent.elements.length - itemsCountStack[lastIndex2];
            pathStack.push(currentCount.toString());
            if (node2.type === "JSONLiteral") {
              const value = node2.value;
              if (isString(value)) {
                const { code, map } = generateMessageFunction(
                  value,
                  options,
                  pathStack
                );
                sourceMap && map != null && codeMaps.set(value, map);
                generator.push(`${code}`, node2, value);
              } else {
                if (forceStringify) {
                  const strValue = JSON.stringify(value);
                  const { code, map } = generateMessageFunction(
                    strValue,
                    options,
                    pathStack
                  );
                  sourceMap && map != null && codeMaps.set(strValue, map);
                  generator.push(`${code}`, node2, strValue);
                } else {
                  generator.push(`${JSON.stringify(value)}`);
                }
              }
            }
            itemsCountStack[lastIndex2] = --itemsCountStack[lastIndex2];
          }
          break;
      }
    },
    leaveNode(node2, parent) {
      switch (node2.type) {
        case "Program":
          if (type === "sfc") {
            generator.deindent();
            generator.push(`})`);
            if (bridge && injector) {
              generator.newline();
              generator.pushline(
                `${componentNamespace}.__i18nBridge = ${componentNamespace}.__i18nBridge || []`
              );
              generator.pushline(
                `${componentNamespace}.__i18nBridge.push('${injector()}')`
              );
              generator.pushline(`delete ${componentNamespace}._Ctor`);
            }
            generator.deindent();
            generator.pushline(`}`);
          } else if (type === "plain") {
            generator.push(`
`);
            generator.push("export default resource");
          }
          break;
        case "JSONObjectExpression":
          if (propsCountStack[propsCountStack.length - 1] === 0) {
            pathStack.pop();
            propsCountStack.pop();
          }
          generator.deindent();
          generator.push(`}`);
          if (parent.type === "JSONArrayExpression") {
            if (itemsCountStack[itemsCountStack.length - 1] !== 0) {
              pathStack.pop();
              generator.pushline(`,`);
            }
          }
          break;
        case "JSONProperty":
          if (propsCountStack[propsCountStack.length - 1] !== 0) {
            pathStack.pop();
            generator.pushline(`,`);
          }
          break;
        case "JSONArrayExpression":
          if (itemsCountStack[itemsCountStack.length - 1] === 0) {
            pathStack.pop();
            itemsCountStack.pop();
          }
          generator.deindent();
          generator.push(`]`);
          if (parent.type === "JSONArrayExpression") {
            if (itemsCountStack[itemsCountStack.length - 1] !== 0) {
              pathStack.pop();
              generator.pushline(`,`);
            }
          }
          break;
        case "JSONLiteral":
          if (parent.type === "JSONArrayExpression") {
            if (itemsCountStack[itemsCountStack.length - 1] !== 0) {
              pathStack.pop();
              generator.pushline(`,`);
            } else {
              generator.pushline(`,`);
            }
          }
          break;
      }
    }
  });
  return codeMaps;
}

function generate$1(targetSource, {
  type = "plain",
  legacy = false,
  bridge = false,
  exportESM = false,
  useClassComponent = false,
  filename = "vue-i18n-loader.yaml",
  inSourceMap = void 0,
  locale = "",
  isGlobal = false,
  sourceMap = false,
  env = "development",
  forceStringify = false,
  onError = void 0,
  strictMessage = true,
  escapeHtml = false
}, injector) {
  const value = Buffer.isBuffer(targetSource) ? targetSource.toString() : targetSource;
  const options = {
    type,
    bridge,
    exportESM,
    source: value,
    sourceMap,
    locale,
    isGlobal,
    inSourceMap,
    env,
    filename,
    forceStringify,
    onError,
    strictMessage,
    escapeHtml,
    useClassComponent
  };
  const generator = createCodeGenerator(options);
  const ast = parseYAML(value, { filePath: filename });
  if (legacy && type === "sfc") {
    const gen = () => friendlyJSONstringify(getStaticYAMLValue(ast));
    const code2 = generateLegacyCode(options, gen);
    const s = new MagicString(code2);
    return {
      ast,
      code: s.toString(),
      map: s.generateMap({
        file: filename,
        source: value,
        includeContent: true
      })
    };
  }
  const codeMaps = generateNode$1(generator, ast, options, injector);
  const { code, map } = generator.context();
  const newMap = map ? mapLinesColumns(map.toJSON(), codeMaps, inSourceMap) || null : null;
  return {
    ast,
    code,
    map: newMap != null ? newMap : void 0
  };
}
function generateNode$1(generator, node, options, injector) {
  const propsCountStack = [];
  const pathStack = [];
  const itemsCountStack = [];
  const { forceStringify } = generator.context();
  const codeMaps = /* @__PURE__ */ new Map();
  const {
    type,
    bridge,
    exportESM,
    sourceMap,
    isGlobal,
    locale,
    useClassComponent
  } = options;
  const componentNamespace = "_Component";
  traverseNodes$1(node, {
    enterNode(node2, parent) {
      switch (node2.type) {
        case "Program":
          if (type === "plain") {
            generator.push(`const resource = `);
          } else if (type === "sfc") {
            const variableName = type === "sfc" ? !isGlobal ? "__i18n" : "__i18nGlobal" : "";
            const localeName = type === "sfc" ? locale != null ? locale : `""` : "";
            const exportSyntax = bridge ? exportESM ? `export default` : `module.exports =` : `export default`;
            generator.push(`${exportSyntax} function (Component) {`);
            generator.indent();
            const componentVariable = bridge ? `Component.options || Component` : useClassComponent ? `Component.__o || Component.__vfdConstructor || Component` : `Component`;
            generator.pushline(`const ${componentNamespace} = ${componentVariable}`);
            generator.pushline(
              `${componentNamespace}.${variableName} = ${componentNamespace}.${variableName} || []`
            );
            generator.push(`${componentNamespace}.${variableName}.push({`);
            generator.indent();
            generator.pushline(`"locale": ${JSON.stringify(localeName)},`);
            generator.push(`"resource": `);
          }
          break;
        case "YAMLMapping":
          generator.push(`{`);
          generator.indent();
          propsCountStack.push(node2.pairs.length);
          if (parent.type === "YAMLSequence") {
            const lastIndex2 = itemsCountStack.length - 1;
            const currentCount = parent.entries.length - itemsCountStack[lastIndex2];
            pathStack.push(currentCount.toString());
            itemsCountStack[lastIndex2] = --itemsCountStack[lastIndex2];
          }
          break;
        case "YAMLPair":
          if (node2.value && node2.value.type === "YAMLScalar" && node2.key && node2.key.type === "YAMLScalar") {
            const name = node2.key.value;
            const value = node2.value.value;
            if (isString(value)) {
              generator.push(`${JSON.stringify(name)}: `);
              name && pathStack.push(name.toString());
              const { code, map } = generateMessageFunction(
                value,
                options,
                pathStack
              );
              sourceMap && map != null && codeMaps.set(value, map);
              generator.push(`${code}`, node2.value, value);
            } else {
              if (forceStringify) {
                const strValue = JSON.stringify(value);
                generator.push(`${JSON.stringify(name)}: `);
                name && pathStack.push(name.toString());
                const { code, map } = generateMessageFunction(
                  strValue,
                  options,
                  pathStack
                );
                sourceMap && map != null && codeMaps.set(strValue, map);
                generator.push(`${code}`, node2.value, strValue);
              } else {
                generator.push(
                  `${JSON.stringify(name)}: ${JSON.stringify(value)}`
                );
                name && pathStack.push(name.toString());
              }
            }
          } else if (node2.value && (node2.value.type === "YAMLMapping" || node2.value.type === "YAMLSequence") && node2.key && node2.key.type === "YAMLScalar") {
            const name = node2.key.value;
            generator.push(`${JSON.stringify(name)}: `);
            name && pathStack.push(name.toString());
          }
          const lastIndex = propsCountStack.length - 1;
          propsCountStack[lastIndex] = --propsCountStack[lastIndex];
          break;
        case "YAMLSequence":
          generator.push(`[`);
          generator.indent();
          if (parent.type === "YAMLSequence") {
            const lastIndex2 = itemsCountStack.length - 1;
            const currentCount = parent.entries.length - itemsCountStack[lastIndex2];
            pathStack.push(currentCount.toString());
            itemsCountStack[lastIndex2] = --itemsCountStack[lastIndex2];
          }
          itemsCountStack.push(node2.entries.length);
          break;
        case "YAMLScalar":
          if (parent.type === "YAMLSequence") {
            const lastIndex2 = itemsCountStack.length - 1;
            const currentCount = parent.entries.length - itemsCountStack[lastIndex2];
            pathStack.push(currentCount.toString());
            if (node2.type === "YAMLScalar") {
              const value = node2.value;
              if (isString(value)) {
                const { code, map } = generateMessageFunction(
                  value,
                  options,
                  pathStack
                );
                sourceMap && map != null && codeMaps.set(value, map);
                generator.push(`${code}`, node2, value);
              } else {
                if (forceStringify) {
                  const strValue = JSON.stringify(value);
                  const { code, map } = generateMessageFunction(
                    strValue,
                    options,
                    pathStack
                  );
                  sourceMap && map != null && codeMaps.set(strValue, map);
                  generator.push(`${code}`, node2, strValue);
                } else {
                  generator.push(`${JSON.stringify(value)}`);
                }
              }
            }
            itemsCountStack[lastIndex2] = --itemsCountStack[lastIndex2];
          }
          break;
      }
    },
    leaveNode(node2, parent) {
      switch (node2.type) {
        case "Program":
          if (type === "sfc") {
            generator.deindent();
            generator.push(`})`);
            if (bridge && injector) {
              generator.newline();
              generator.pushline(
                `${componentNamespace}.__i18nBridge = ${componentNamespace}.__i18nBridge || []`
              );
              generator.pushline(
                `${componentNamespace}.__i18nBridge.push('${injector()}')`
              );
              generator.pushline(`delete ${componentNamespace}._Ctor`);
            }
            generator.deindent();
            generator.push(`}`);
          } else if (type === "plain") {
            generator.push(`
`);
            generator.push("export default resource");
          }
          break;
        case "YAMLMapping":
          if (propsCountStack[propsCountStack.length - 1] === 0) {
            pathStack.pop();
            propsCountStack.pop();
          }
          generator.deindent();
          generator.push(`}`);
          if (parent.type === "YAMLSequence") {
            if (itemsCountStack[itemsCountStack.length - 1] !== 0) {
              pathStack.pop();
              generator.pushline(`,`);
            }
          }
          break;
        case "YAMLPair":
          if (propsCountStack[propsCountStack.length - 1] !== 0) {
            pathStack.pop();
            generator.pushline(`,`);
          }
          break;
        case "YAMLSequence":
          if (itemsCountStack[itemsCountStack.length - 1] === 0) {
            pathStack.pop();
            itemsCountStack.pop();
          }
          generator.deindent();
          generator.push(`]`);
          if (parent.type === "YAMLSequence") {
            if (itemsCountStack[itemsCountStack.length - 1] !== 0) {
              pathStack.pop();
              generator.pushline(`,`);
            }
          }
          break;
        case "YAMLScalar":
          if (parent.type === "YAMLSequence") {
            if (itemsCountStack[itemsCountStack.length - 1] !== 0) {
              pathStack.pop();
              generator.pushline(`,`);
            } else {
              generator.pushline(`,`);
            }
          }
          break;
      }
    }
  });
  return codeMaps;
}

function generate(targetSource, {
  type = "plain",
  bridge = false,
  exportESM = false,
  filename = "vue-i18n-loader.js",
  inSourceMap = void 0,
  locale = "",
  isGlobal = false,
  sourceMap = false,
  env = "development",
  forceStringify = false,
  onError = void 0,
  strictMessage = true,
  escapeHtml = false,
  useClassComponent = false,
  allowDynamic = false
}, injector) {
  const target = Buffer.isBuffer(targetSource) ? targetSource.toString() : targetSource;
  const value = target;
  const options = {
    type,
    bridge,
    exportESM,
    source: value,
    sourceMap,
    locale,
    isGlobal,
    inSourceMap,
    env,
    filename,
    forceStringify,
    onError,
    strictMessage,
    escapeHtml,
    useClassComponent
  };
  const generator = createCodeGenerator(options);
  const ast = parse(value, {
    ecmaVersion: "latest",
    sourceType: "module",
    sourceFile: filename,
    allowImportExportEverywhere: true
  });
  const exportResult = scanAst(ast);
  if (!allowDynamic) {
    if (!exportResult || exportResult !== "object") {
      throw new Error(
        `You need to define an object as the locale message with 'export default'.`
      );
    }
  } else {
    if (!exportResult) {
      throw new Error(
        `You need to define 'export default' that will return the locale messages.`
      );
    }
    if (exportResult !== "object") {
      return {
        ast,
        code: value,
        map: inSourceMap
      };
    }
  }
  const codeMaps = generateNode(generator, ast, options, injector);
  const { code, map } = generator.context();
  const newMap = map ? mapLinesColumns(map.toJSON(), codeMaps, inSourceMap) || null : null;
  return {
    ast,
    code,
    map: newMap != null ? newMap : void 0
  };
}
function scanAst(ast) {
  if (ast.type !== "Program") {
    throw new Error("Invalid AST: does not have Program node");
  }
  let ret = false;
  for (const node of ast.body) {
    if (node.type === "ExportDefaultDeclaration") {
      if (node.declaration.type === "ObjectExpression") {
        ret = "object";
        break;
      } else if (node.declaration.type === "FunctionDeclaration") {
        ret = "function";
        break;
      } else if (node.declaration.type === "ArrowFunctionExpression") {
        ret = "arrow-function";
        break;
      }
    }
  }
  return ret;
}
function generateNode(generator, node, options, injector) {
  const propsCountStack = [];
  const pathStack = [];
  const itemsCountStack = [];
  const skipStack = [];
  const { forceStringify } = generator.context();
  const codeMaps = /* @__PURE__ */ new Map();
  const {
    type,
    bridge,
    exportESM,
    sourceMap,
    isGlobal,
    locale,
    useClassComponent
  } = options;
  const componentNamespace = "_Component";
  walk(node, {
    /**
     * NOTE:
     *  force cast to Node of `estree-walker@3.x`,
     *  because `estree-walker@3.x` is not dual packages,
     *  so it's support only esm only ...
     */
    // @ts-ignore
    enter(node2, parent) {
      switch (node2.type) {
        case "Program":
          if (type === "plain") {
            generator.push(`const resource = `);
          } else if (type === "sfc") {
            const variableName = type === "sfc" ? !isGlobal ? "__i18n" : "__i18nGlobal" : "";
            const localeName = type === "sfc" ? locale != null ? locale : `""` : "";
            const exportSyntax = bridge ? exportESM ? `export default` : `module.exports =` : `export default`;
            generator.push(`${exportSyntax} function (Component) {`);
            generator.indent();
            const componentVariable = bridge ? `Component.options || Component` : useClassComponent ? `Component.__o || Component.__vfdConstructor || Component` : `Component`;
            generator.pushline(`const ${componentNamespace} = ${componentVariable}`);
            generator.pushline(
              `${componentNamespace}.${variableName} = ${componentNamespace}.${variableName} || []`
            );
            generator.push(`${componentNamespace}.${variableName}.push({`);
            generator.indent();
            generator.pushline(`"locale": ${JSON.stringify(localeName)},`);
            generator.push(`"resource": `);
          }
          break;
        case "ObjectExpression":
          generator.push(`{`);
          generator.indent();
          propsCountStack.push(node2.properties.length);
          if (parent != null && parent.type === "ArrayExpression") {
            const lastIndex = itemsCountStack.length - 1;
            const currentCount = parent.elements.length - itemsCountStack[lastIndex];
            pathStack.push(currentCount.toString());
            itemsCountStack[lastIndex] = --itemsCountStack[lastIndex];
          }
          break;
        case "Property":
          if (parent != null && parent.type === "ObjectExpression") {
            if (node2 != null) {
              if (isJSONablePrimitiveLiteral(node2.value) && (node2.key.type === "Literal" || node2.key.type === "Identifier")) {
                const name = node2.key.type === "Literal" ? String(node2.key.value) : node2.key.name;
                if (node2.value.type === "Literal" && isString(node2.value.value) || node2.value.type === "TemplateLiteral") {
                  const value = getValue(node2.value);
                  generator.push(`${JSON.stringify(name)}: `);
                  pathStack.push(name);
                  const { code, map } = generateMessageFunction(
                    value,
                    options,
                    pathStack
                  );
                  sourceMap && map != null && codeMaps.set(value, map);
                  generator.push(`${code}`, node2.value, value);
                  skipStack.push(false);
                } else {
                  const value = getValue(node2.value);
                  if (forceStringify) {
                    const strValue = JSON.stringify(value);
                    generator.push(`${JSON.stringify(name)}: `);
                    pathStack.push(name);
                    const { code, map } = generateMessageFunction(
                      strValue,
                      options,
                      pathStack
                    );
                    sourceMap && map != null && codeMaps.set(strValue, map);
                    generator.push(`${code}`, node2.value, strValue);
                  } else {
                    generator.push(
                      `${JSON.stringify(name)}: ${JSON.stringify(value)}`
                    );
                    pathStack.push(name);
                  }
                  skipStack.push(false);
                }
              } else if ((node2.value.type === "FunctionExpression" || node2.value.type === "ArrowFunctionExpression") && (node2.key.type === "Literal" || node2.key.type === "Identifier")) {
                const name = node2.key.type === "Literal" ? String(node2.key.value) : node2.key.name;
                generator.push(`${JSON.stringify(name)}: `);
                pathStack.push(name);
                const code = generate$3(node2.value);
                generator.push(`${code}`, node2.value, code);
                skipStack.push(false);
              } else if ((node2.value.type === "ObjectExpression" || node2.value.type === "ArrayExpression") && (node2.key.type === "Literal" || node2.key.type === "Identifier")) {
                const name = node2.key.type === "Literal" ? String(node2.key.value) : node2.key.name;
                generator.push(`${JSON.stringify(name)}: `);
                pathStack.push(name);
              } else {
                skipStack.push(true);
              }
            }
            const lastIndex = propsCountStack.length - 1;
            propsCountStack[lastIndex] = --propsCountStack[lastIndex];
          }
          break;
        case "ArrayExpression":
          generator.push(`[`);
          generator.indent();
          if (parent != null && parent.type === "ArrayExpression") {
            const lastIndex = itemsCountStack.length - 1;
            const currentCount = parent.elements.length - itemsCountStack[lastIndex];
            pathStack.push(currentCount.toString());
            itemsCountStack[lastIndex] = --itemsCountStack[lastIndex];
          }
          itemsCountStack.push(node2.elements.length);
          break;
        default:
          if (node2 != null && parent != null) {
            if (parent.type === "ArrayExpression") {
              const lastIndex = itemsCountStack.length - 1;
              const currentCount = parent.elements.length - itemsCountStack[lastIndex];
              pathStack.push(currentCount.toString());
              if (isJSONablePrimitiveLiteral(node2)) {
                if (node2.type === "Literal" && isString(node2.value) || node2.type === "TemplateLiteral") {
                  const value = getValue(node2);
                  const { code, map } = generateMessageFunction(
                    value,
                    options,
                    pathStack
                  );
                  sourceMap && map != null && codeMaps.set(value, map);
                  generator.push(`${code}`, node2, value);
                } else {
                  const value = getValue(node2);
                  if (forceStringify) {
                    const strValue = JSON.stringify(value);
                    const { code, map } = generateMessageFunction(
                      strValue,
                      options,
                      pathStack
                    );
                    sourceMap && map != null && codeMaps.set(strValue, map);
                    generator.push(`${code}`, node2, strValue);
                  } else {
                    generator.push(`${JSON.stringify(value)}`);
                  }
                }
                skipStack.push(false);
              } else {
                skipStack.push(true);
              }
              itemsCountStack[lastIndex] = --itemsCountStack[lastIndex];
            }
          }
          break;
      }
    },
    /**
     * NOTE:
     *  force cast to Node of `estree-walker@3.x`,
     *  because `estree-walker@3.x` is not dual packages,
     *  so it's support only esm only ...
     */
    // @ts-ignore
    leave(node2, parent) {
      switch (node2.type) {
        case "Program":
          if (type === "sfc") {
            generator.deindent();
            generator.push(`})`);
            if (bridge && injector) {
              generator.newline();
              generator.pushline(
                `${componentNamespace}.__i18nBridge = ${componentNamespace}.__i18nBridge || []`
              );
              generator.pushline(
                `${componentNamespace}.__i18nBridge.push('${injector()}')`
              );
              generator.pushline(`delete ${componentNamespace}._Ctor`);
            }
            generator.deindent();
            generator.pushline(`}`);
          } else if (type === "plain") {
            generator.push(`
`);
            generator.push("export default resource");
          }
          break;
        case "ObjectExpression":
          if (propsCountStack[propsCountStack.length - 1] === 0) {
            pathStack.pop();
            propsCountStack.pop();
          }
          generator.deindent();
          generator.push(`}`);
          if (parent != null && parent.type === "ArrayExpression") {
            if (itemsCountStack[itemsCountStack.length - 1] !== 0) {
              pathStack.pop();
              generator.pushline(`,`);
            }
          }
          break;
        case "Property":
          if (parent != null && parent.type === "ObjectExpression") {
            if (propsCountStack[propsCountStack.length - 1] !== 0) {
              pathStack.pop();
              if (!skipStack.pop()) {
                generator.pushline(`,`);
              }
            }
          }
          break;
        case "ArrayExpression":
          if (itemsCountStack[itemsCountStack.length - 1] === 0) {
            pathStack.pop();
            itemsCountStack.pop();
          }
          generator.deindent();
          generator.push(`]`);
          if (parent != null && parent.type === "ArrayExpression") {
            if (itemsCountStack[itemsCountStack.length - 1] !== 0) {
              pathStack.pop();
              if (!skipStack.pop()) {
                generator.pushline(`,`);
              }
            }
          }
          break;
        case "Literal":
          if (parent != null && parent.type === "ArrayExpression") {
            if (itemsCountStack[itemsCountStack.length - 1] !== 0) {
              pathStack.pop();
              if (!skipStack.pop()) {
                generator.pushline(`,`);
              }
            } else {
              if (!skipStack.pop()) {
                generator.pushline(`,`);
              }
            }
          }
          break;
      }
    }
  });
  return codeMaps;
}
function isJSONablePrimitiveLiteral(node) {
  return node.type === "Literal" && (isString(node.value) || isNumber(node.value) || isBoolean(node.value) || node.value === null) || node.type === "TemplateLiteral";
}
function getValue(node) {
  return node.type === "Literal" ? node.value : node.type === "TemplateLiteral" ? node.quasis.map((quasi) => quasi.value.cooked).join("") : void 0;
}

const _require = module.createRequire(import.meta.url);
function checkInstallPackage(pkg, debug) {
  let installedVueI18n = false;
  try {
    debug(`vue-i18n load path: ${_require.resolve("vue-i18n")}`);
    installedVueI18n = true;
  } catch (e) {
    debug(`cannot find 'vue-i18n'`, e);
  }
  let installedPetiteVueI18n = false;
  try {
    debug(`petite-vue-i18n load path: ${_require.resolve("petite-vue-i18n")}`);
    installedPetiteVueI18n = true;
  } catch (e) {
    debug(`cannot find 'petite-vue-i18n'`, e);
  }
  if (installedVueI18n) {
    return "vue-i18n";
  }
  if (installedPetiteVueI18n) {
    return "petite-vue-i18n";
  }
  throw new Error(
    `${pkg} requires 'vue-i18n' or 'petite-vue-i18n' to be present in the dependency tree.`
  );
}
function checkVueI18nBridgeInstallPackage(debug) {
  let ret = false;
  try {
    debug(`vue-i18n-bridge load path: ${_require.resolve("vue-i18n-bridge")}`);
    ret = true;
  } catch (e) {
    debug(`cannot find 'vue-i18n-bridge'`, e);
  }
  return ret;
}
function getVueI18nVersion(debug) {
  const VueI18n = loadModule("vue-i18n", debug);
  if (VueI18n == null) {
    return "";
  }
  if (VueI18n.version && VueI18n.version.startsWith("8.")) {
    return "8";
  }
  if (VueI18n.VERSION && VueI18n.VERSION.startsWith("9.")) {
    return "9";
  }
  return "unknown";
}
function loadModule(moduleName, debug) {
  try {
    return _require(moduleName);
  } catch (e) {
    debug(`cannot load '${moduleName}'`, e);
    return null;
  }
}

export { checkInstallPackage, checkVueI18nBridgeInstallPackage, generate$2 as generateJSON, generate as generateJavaScript, generate$1 as generateYAML, getVueI18nVersion };
