import { JSONProgram } from 'jsonc-eslint-parser/lib/parser/ast';
import { RawSourceMap } from 'source-map';
import { CompileError } from '@intlify/message-compiler';
import { YAMLProgram } from 'yaml-eslint-parser/lib/ast';
import { Node } from 'estree';

/**
 * Compilation dev environments
 *
 * @public
 */
type DevEnv = 'development' | 'production';
/**
 * @internal
 */
interface CodeGenOptions {
    type?: 'plain' | 'sfc' | 'bare';
    legacy?: boolean;
    bridge?: boolean;
    exportESM?: boolean;
    source?: string;
    sourceMap?: boolean;
    filename?: string;
    inSourceMap?: RawSourceMap;
    isGlobal?: boolean;
    locale?: string;
    env?: DevEnv;
    forceStringify?: boolean;
    useClassComponent?: boolean;
    allowDynamic?: boolean;
    strictMessage?: boolean;
    escapeHtml?: boolean;
    onWarn?: (msg: string) => void;
    onError?: (msg: string, extra?: {
        source: string;
        path: string;
        code?: CompileError['code'];
        domain?: CompileError['domain'];
        location?: CompileError['location'];
    }) => void;
}
/**
 * @internal
 */
interface CodeGenResult<ASTNode, CodeGenError extends Error = Error> {
    code: string;
    ast: ASTNode;
    errors?: CodeGenError[];
    map?: RawSourceMap;
}

/**
 * Code generator for i18n json/json5 resource
 */

/**
 * @internal
 */
declare function generate$2(targetSource: string | Buffer, { type, legacy, bridge, exportESM, filename, inSourceMap, locale, isGlobal, sourceMap, env, forceStringify, onError, strictMessage, escapeHtml, useClassComponent }: CodeGenOptions, injector?: () => string): CodeGenResult<JSONProgram>;

/**
 * Code generator for i18n yaml resource
 */

/**
 * @internal
 */
declare function generate$1(targetSource: string | Buffer, { type, legacy, bridge, exportESM, useClassComponent, filename, inSourceMap, locale, isGlobal, sourceMap, env, forceStringify, onError, strictMessage, escapeHtml }: CodeGenOptions, injector?: () => string): CodeGenResult<YAMLProgram>;

/**
 * Code generator for i18n js resource
 */

/**
 * @internal
 */
declare function generate(targetSource: string | Buffer, { type, bridge, exportESM, filename, inSourceMap, locale, isGlobal, sourceMap, env, forceStringify, onError, strictMessage, escapeHtml, useClassComponent, allowDynamic }: CodeGenOptions, injector?: () => string): CodeGenResult<Node>;

type InstalledPackage = 'vue-i18n' | 'petite-vue-i18n';
declare function checkInstallPackage(pkg: string, debug: Function): InstalledPackage;
declare function checkVueI18nBridgeInstallPackage(debug: Function): boolean;
type VueI18nVersion = '8' | '9' | 'unknown' | '';
declare function getVueI18nVersion(debug: Function): VueI18nVersion;

export { CodeGenOptions, CodeGenResult, DevEnv, InstalledPackage, checkInstallPackage, checkVueI18nBridgeInstallPackage, generate$2 as generateJSON, generate as generateJavaScript, generate$1 as generateYAML, getVueI18nVersion };
