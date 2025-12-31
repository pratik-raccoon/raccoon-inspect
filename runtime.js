// Client-side runtime for source selector
// This file is imported by the Babel plugin and runs only in the browser

if (typeof window !== 'undefined' && !window.__sourceSelectorInitialized) {
    console.log('[raccoon-inspect] Runtime module loaded');
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
      e.target.style.outline = '2px solid #4d5fef';
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
                // Silently fail cross-origin errors
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
                // Silently fail cross-origin errors
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
  
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSelector);
  } else {
    initSelector();
  }
}
