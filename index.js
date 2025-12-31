module.exports = function ({ types: t }) {
    return {
      visitor: {
        Program: {
          enter(path, state) {
            state.fileName = state.file.opts.filename || 'unknown';
            state.componentStack = []; // Track nested components
            
            // Track if selector has been injected globally
            if (!state.file.selectorInjected) {
              state.file.selectorInjected = false;
            }
          },
          exit(path, state) {
            // Inject selector script once per app (only in files with JSX)
            if (state.file.selectorInjected) return;
            
            const fileName = state.fileName;
            const isRootFile = fileName.includes('layout.tsx') || 
                              fileName.includes('_app') || 
                              fileName.includes('page.tsx');
            
            // Only inject in root files to avoid duplicates
            // Prefer client components, but also inject in server components (will run on client)
            if (isRootFile && hasJSXInProgram(path)) {
              try {
                injectSelectorScript(path, t);
                state.file.selectorInjected = true;
              } catch (err) {
                // Silently fail if injection fails
              }
            }
          }
        },
        
        // 1. Add __source to FUNCTION COMPONENTS (Fiber-accessible)
        FunctionDeclaration: {
          enter(path, state) {
            if (!hasJSX(path)) return;
            
            const fileName = state.fileName;
            const line = path.node.loc?.start?.line || 1;
            const componentName = path.node.id?.name || 'AnonymousComponent';
            
            // Push component name onto stack for JSX elements to use
            state.componentStack.push(componentName);
            
            const sourceInfo = t.objectExpression([
              t.objectProperty(t.identifier('file'), t.stringLiteral(fileName)),
              t.objectProperty(t.identifier('line'), t.stringLiteral(line.toString())),
              t.objectProperty(t.identifier('name'), t.stringLiteral(componentName))
            ]);
            
            // Add static property OUTSIDE function body (module scope)
            const assignment = t.expressionStatement(
              t.assignmentExpression('=', 
                t.memberExpression(t.identifier(componentName), t.identifier('__source')),
                sourceInfo
              )
            );
            
            // Insert assignment right after the function declaration
            path.insertAfter(assignment);
          },
          exit(path, state) {
            if (!hasJSX(path)) return;
            // Pop component name from stack when exiting function
            state.componentStack.pop();
          }
        },

        // Handle arrow functions and function expressions (const Component = () => ...)
        ArrowFunctionExpression: {
          enter(path, state) {
            if (!hasJSX(path)) return;
            
            // Try to get the variable name if this is assigned to a variable
            const parent = path.parent;
            let componentName = 'AnonymousComponent';
            
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
            
            // If assigned to a variable, use that name
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
  
        // 2. Add data-source attributes to JSX ELEMENTS (DOM + DevTools)
        JSXOpeningElement(path, state) {
          const fileName = state.fileName;
          const line = (path.node.loc?.start?.line || 1).toString();
          const componentName = state.componentStack[state.componentStack.length - 1] || 'unknown';
          
          // Add source metadata attributes to JSX elements
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
  
  function hasJSX(path) {
    let hasJSXElement = false;
    path.traverse({
      JSXElement() { hasJSXElement = true; }
    });
    return hasJSXElement;
  }

  function hasJSXInProgram(path) {
    let hasJSXElement = false;
    path.traverse({
      JSXElement() { hasJSXElement = true; }
    });
    return hasJSXElement;
  }

  function injectSelectorScript(path, t) {
    // Use @babel/parser to parse the selector code string
    try {
      const parser = require('@babel/parser');
      const selectorCode = `(function() {
        if (typeof window === 'undefined') return;
        if (window.__sourceSelectorInitialized) return;
        window.__sourceSelectorInitialized = true;
        let isActive = false;
        let highlightedElement = null;
        
        function loadHtmlToImage() {
          return new Promise(function(resolve, reject) {
            if (window.htmlToImage) {
              resolve(window.htmlToImage);
              return;
            }
            if (window.__htmlToImageLoading) {
              window.__htmlToImageLoading.then(resolve).catch(reject);
              return;
            }
            window.__htmlToImageLoading = new Promise(function(loadResolve, loadReject) {
              const script = document.createElement('script');
              script.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js';
              script.onload = function() {
                if (window.htmlToImage) {
                  loadResolve(window.htmlToImage);
                } else {
                  loadReject(new Error('html-to-image failed to load'));
                }
              };
              script.onerror = function() {
                loadReject(new Error('Failed to load html-to-image'));
              };
              document.head.appendChild(script);
            });
            window.__htmlToImageLoading.then(resolve).catch(reject);
          });
        }
        
        function initSelector() {
          window.__sourceSelectorReady = true;
          
          window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'ENABLE_SOURCE_SELECTOR') {
              isActive = true;
            } else if (event.data && event.data.type === 'DISABLE_SOURCE_SELECTOR') {
              isActive = false;
              if (highlightedElement) {
                highlightedElement.style.outline = '';
                highlightedElement = null;
              }
            }
          });
          document.addEventListener('mouseover', function(e) {
            if (!isActive) return;
            if (highlightedElement && highlightedElement !== e.target) {
              highlightedElement.style.outline = '';
            }
            e.target.style.outline = '2px solid #3b82f6';
            e.target.style.outlineOffset = '2px';
            highlightedElement = e.target;
          }, true);
          document.addEventListener('click', function(e) {
            if (!isActive) return;
            
            let target = e.target;
            let attempts = 0;
            while (target && attempts < 10) {
              const component = target.getAttribute('data-source-component');
              const file = target.getAttribute('data-source-file');
              const line = target.getAttribute('data-source-line');
              
              if (component || file || line) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                loadHtmlToImage().then(function(htmlToImage) {
                  return htmlToImage.toPng(target, {
                    cacheBust: true,
                    pixelRatio: 1
                  });
                }).then(function(dataUrl) {
                  const messageData = {
                    type: 'SOURCE_SELECTED',
                    data: {
                      component: component || 'unknown',
                      file: file || 'unknown',
                      line: line || 'unknown',
                      screenshot: dataUrl,
                      element: {
                        tagName: target.tagName,
                        id: target.id || '',
                        className: target.className || ''
                      }
                    }
                  };
                  if (window.parent && window.parent !== window) {
                    try {
                      window.parent.postMessage(messageData, '*');
                    } catch (err) {
                    }
                  }
                  isActive = false;
                  if (highlightedElement) {
                    highlightedElement.style.outline = '';
                    highlightedElement = null;
                  }
                }).catch(function(err) {
                  const messageData = {
                    type: 'SOURCE_SELECTED',
                    data: {
                      component: component || 'unknown',
                      file: file || 'unknown',
                      line: line || 'unknown',
                      screenshot: null,
                      error: err.message || 'Unknown error',
                      element: {
                        tagName: target.tagName,
                        id: target.id || '',
                        className: target.className || ''
                      }
                    }
                  };
                  if (window.parent && window.parent !== window) {
                    try {
                      window.parent.postMessage(messageData, '*');
                    } catch (err) {
                    }
                  }
                  isActive = false;
                  if (highlightedElement) {
                    highlightedElement.style.outline = '';
                    highlightedElement = null;
                  }
                });
                return;
              }
              target = target.parentElement;
              attempts++;
            }
          }, true);
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initSelector);
        } else {
          initSelector();
        }
      })();`;
      
      const parsed = parser.parse(selectorCode, {
        sourceType: 'script',
        allowReturnOutsideFunction: true
      });
      
      // Inject the parsed code at the end of the program
      path.pushContainer('body', parsed.program.body);
    } catch (e) {
      // Silently fail if parsing fails
    }
  }
  