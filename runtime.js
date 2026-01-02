if (typeof window !== 'undefined' && !window.__sourceSelectorInitialized) {
  console.log('[raccoon-inspect] Runtime module loaded');
  window.__sourceSelectorInitialized = true;
  
  let isActive = false;
  let hoveredElement = null;
  let overlayBlocker = null;
  let overlayHighlight = null;
  
  function elementToString(element) {
    const tagName = element.tagName.toLowerCase();
    const attrs = [];
    
    if (element.attributes && element.attributes.length > 0) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        const escapedValue = attr.value.replace(/"/g, '&quot;');
        attrs.push(`${attr.name}="${escapedValue}"`);
      }
    }
    
    const attrString = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    return `<${tagName}${attrString}>`;
  }
  
  function findTaggedElement(startElement) {
    let target = startElement;
    let attempts = 0;
    
    while (target && attempts < 10) {
      const component = target.getAttribute?.('data-source-component');
      const file = target.getAttribute?.('data-source-file');
      const line = target.getAttribute?.('data-source-line');
      
      if (component || file || line) {
        return { target, component, file, line };
      }
      
      target = target.parentElement;
      attempts++;
    }
    
    return null;
  }
  
  function postSelectionMessage(payload) {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'SOURCE_SELECTED',
          data: payload
        }, '*');
      } catch (err) {
        console.warn('[raccoon-inspect] Failed to post message:', err);
      }
    }
  }
  
  function setHighlight(target) {
    if (!overlayHighlight) return;
    
    if (!target) {
      overlayHighlight.style.display = 'none';
      return;
    }
    
    const rect = target.getBoundingClientRect();
    overlayHighlight.style.display = 'block';
    overlayHighlight.style.left = `${rect.left}px`;
    overlayHighlight.style.top = `${rect.top}px`;
    overlayHighlight.style.width = `${rect.width}px`;
    overlayHighlight.style.height = `${rect.height}px`;
  }
  
  function getUnderlyingElement(x, y) {
    const prevBlockerPointer = overlayBlocker?.style.pointerEvents;
    const prevBlockerVisibility = overlayBlocker?.style.visibility;
    const prevHighlightVisibility = overlayHighlight?.style.visibility;
    
    if (overlayBlocker) {
      overlayBlocker.style.pointerEvents = 'none';
      overlayBlocker.style.visibility = 'hidden';
    }
    if (overlayHighlight) {
      overlayHighlight.style.visibility = 'hidden';
    }
    
    const element = document.elementFromPoint(x, y);
    
    if (overlayBlocker) {
      overlayBlocker.style.pointerEvents = prevBlockerPointer || 'auto';
      overlayBlocker.style.visibility = prevBlockerVisibility || 'visible';
    }
    if (overlayHighlight) {
      overlayHighlight.style.visibility = prevHighlightVisibility || 'visible';
    }
    
    return element;
  }
  
  function handlePointerMove(event) {
    if (!isActive) return;
    
    const underlying = getUnderlyingElement(event.clientX, event.clientY);
    if (!underlying || underlying === overlayBlocker || underlying === overlayHighlight) {
      hoveredElement = null;
      setHighlight(null);
      return;
    }
    
    if (hoveredElement !== underlying) {
      hoveredElement = underlying;
      setHighlight(hoveredElement);
    }
  }
  
  function handleOverlayClick(event) {
    if (!isActive) return;
    
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    
    const underlying = getUnderlyingElement(event.clientX, event.clientY);
    const tagged = underlying ? findTaggedElement(underlying) : null;
    
    if (tagged) {
      postSelectionMessage({
        component: tagged.component || 'unknown',
        file: tagged.file || 'unknown',
        line: tagged.line || 'unknown',
        element: elementToString(tagged.target)
      });
    }
    
    isActive = false;
    cleanupOverlays();
  }
  
  function createOverlays() {
    if (overlayBlocker || overlayHighlight) return;
    
    overlayBlocker = document.createElement('div');
    overlayBlocker.style.position = 'fixed';
    overlayBlocker.style.inset = '0';
    overlayBlocker.style.zIndex = '2147483646';
    overlayBlocker.style.background = 'transparent';
    overlayBlocker.style.cursor = 'crosshair';
    overlayBlocker.style.userSelect = 'none';
    overlayBlocker.style.pointerEvents = 'auto';
    
    overlayHighlight = document.createElement('div');
    overlayHighlight.style.position = 'fixed';
    overlayHighlight.style.border = '2px solid #4d5fef';
    overlayHighlight.style.boxSizing = 'border-box';
    overlayHighlight.style.pointerEvents = 'none';
    overlayHighlight.style.zIndex = '2147483647';
    overlayHighlight.style.display = 'none';
    
    overlayBlocker.addEventListener('mousemove', handlePointerMove, true);
    overlayBlocker.addEventListener('click', handleOverlayClick, true);
    
    document.body.appendChild(overlayBlocker);
    document.body.appendChild(overlayHighlight);
  }
  
  function cleanupOverlays() {
    hoveredElement = null;
    
    if (overlayBlocker) {
      overlayBlocker.removeEventListener('mousemove', handlePointerMove, true);
      overlayBlocker.removeEventListener('click', handleOverlayClick, true);
      overlayBlocker.parentNode?.removeChild(overlayBlocker);
      overlayBlocker = null;
    }
    
    if (overlayHighlight) {
      overlayHighlight.parentNode?.removeChild(overlayHighlight);
      overlayHighlight = null;
    }
  }
  
  function initSelector() {
    window.__sourceSelectorReady = true;
    
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'ENABLE_SOURCE_SELECTOR') {
        isActive = true;
        createOverlays();
      } else if (event.data?.type === 'DISABLE_SOURCE_SELECTOR') {
        isActive = false;
        cleanupOverlays();
      }
    });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSelector);
  } else {
    initSelector();
  }
}
