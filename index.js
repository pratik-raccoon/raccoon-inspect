module.exports = function ({ types: t }) {
  return {
    visitor: {
      Program: {
        enter(path, state) {
          state.fileName = state.file.opts.filename || 'unknown';
          state.componentStack = [];
          
          if (!hasJSX(path)) return;
          
          const isServerOnly = path.node.directives?.some(directive => {
            const value = directive.value;
            return value && (
              (typeof value === 'string' && value === 'use server') ||
              (value.value === 'use server')
            );
          });
          
          if (isServerOnly) return;
          
          const hasRuntimeImport = path.node.body.some(node => {
            if (t.isImportDeclaration(node)) {
              const sourceValue = node.source.value;
              return sourceValue === 'raccoon-inspect/runtime' ||
                     sourceValue === './runtime' ||
                     sourceValue === '../runtime' ||
                     sourceValue.includes('raccoon-inspect/runtime');
            }
            return false;
          });
          
          if (!hasRuntimeImport) {
            const runtimeImport = t.importDeclaration(
              [],
              t.stringLiteral('raccoon-inspect/runtime')
            );
            
            let insertIndex = 0;
            for (let i = 0; i < path.node.body.length; i++) {
              if (t.isImportDeclaration(path.node.body[i])) {
                insertIndex = i + 1;
              } else if (!t.isExpressionStatement(path.node.body[i])) {
                break;
              }
            }
            
            path.node.body.splice(insertIndex, 0, runtimeImport);
          }
        }
      },
      
      FunctionDeclaration: {
        enter(path, state) {
          if (!hasJSX(path)) return;
          
          const fileName = state.fileName;
          const line = path.node.loc?.start?.line || 1;
          const componentName = path.node.id?.name || 'AnonymousComponent';
          
          state.componentStack.push(componentName);
          
          const sourceInfo = t.objectExpression([
            t.objectProperty(t.identifier('file'), t.stringLiteral(fileName)),
            t.objectProperty(t.identifier('line'), t.stringLiteral(line.toString())),
            t.objectProperty(t.identifier('name'), t.stringLiteral(componentName))
          ]);
          
          const assignment = t.expressionStatement(
            t.assignmentExpression('=', 
              t.memberExpression(t.identifier(componentName), t.identifier('__source')),
              sourceInfo
            )
          );
          
          path.insertAfter(assignment);
        },
        exit(path, state) {
          if (!hasJSX(path)) return;
          state.componentStack.pop();
        }
      },

      ArrowFunctionExpression: {
        enter(path, state) {
          if (!hasJSX(path)) return;
          
          const parent = path.parent;
          let componentName = inferJSXNameFromBody(path.node.body) || 'element';
          
          if (t.isVariableDeclarator(parent) && parent.id?.name) {
            componentName = parent.id.name;
          }
          
          state.componentStack.push(componentName);
        },
        exit(path, state) {
          if (!hasJSX(path)) return;
          state.componentStack.pop();
        }
      },

      FunctionExpression: {
        enter(path, state) {
          if (!hasJSX(path)) return;
          
          const parent = path.parent;
          let componentName = path.node.id?.name || 'AnonymousComponent';
          
          if (t.isVariableDeclarator(parent) && parent.id?.name) {
            componentName = parent.id.name;
          }
          
          state.componentStack.push(componentName);
        },
        exit(path, state) {
          if (!hasJSX(path)) return;
          state.componentStack.pop();
        }
      },

      JSXOpeningElement(path, state) {
        const fileName = state.fileName;
        const line = (path.node.loc?.start?.line || 1).toString();
        const componentName = state.componentStack[state.componentStack.length - 1] || 'unknown';
        
        path.node.attributes.push(
          t.jsxAttribute(
            t.jsxIdentifier('data-source-file'),
            t.stringLiteral(fileName)
          ),
          t.jsxAttribute(
            t.jsxIdentifier('data-source-line'),
            t.stringLiteral(line)
          ),
          t.jsxAttribute(
            t.jsxIdentifier('data-source-component'),
            t.stringLiteral(componentName)
          )
        );
      }
    }
  };
};

function jsxNameToString(nameNode) {
  if (!nameNode) return null;
  
  if (nameNode.type === 'JSXIdentifier') {
    return nameNode.name;
  }
  
  if (nameNode.type === 'JSXMemberExpression') {
    const objectName = jsxNameToString(nameNode.object);
    const propertyName = jsxNameToString(nameNode.property);
    return (objectName && propertyName) ? `${objectName}.${propertyName}` : null;
  }
  
  if (nameNode.type === 'JSXNamespacedName') {
    const ns = nameNode.namespace?.name;
    const name = nameNode.name?.name;
    return (ns && name) ? `${ns}:${name}` : null;
  }
  
  return null;
}

function inferJSXNameFromBody(bodyNode) {
  if (!bodyNode) return null;
  
  if (bodyNode.type === 'JSXElement') {
    return jsxNameToString(bodyNode.openingElement?.name);
  }
  
  if (bodyNode.type === 'JSXFragment') {
    return 'Fragment';
  }
  
  if (bodyNode.type === 'BlockStatement') {
    for (const stmt of bodyNode.body) {
      if (stmt.type === 'ReturnStatement' && stmt.argument) {
        const fromReturn = inferJSXNameFromBody(stmt.argument);
        if (fromReturn) return fromReturn;
      }
    }
  }
  
  return null;
}

function hasJSX(path) {
  let hasJSXElement = false;
  path.traverse({
    JSXElement() { hasJSXElement = true; }
  });
  return hasJSXElement;
}
