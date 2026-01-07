if (typeof window !== 'undefined' && !window.__sourceSelectorInitialized) {
  console.log('[raccoon-inspect] Runtime module loaded');
  window.__sourceSelectorInitialized = true;
  
  let isActive = false;
  let isToolbarOpen = false;
  let hoveredElement = null;
  let selectedTaggedElement = null;
  let overlayBlocker = null;
  let overlayHighlight = null;
  let toolbar = null;
  
  const COLORS = {
    card: 'hsl(240, 6%, 12%)',
    border: 'hsl(240, 6%, 18%)',
    muted: 'hsl(240, 5%, 20%)',
    mutedForeground: 'hsl(240, 5%, 65%)',
    accentForeground: 'hsl(0, 0%, 98%)',
    primary: '#5b5fc7',
    primaryHover: '#4a4cd4'
  };
  
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
    const prevToolbarVisibility = toolbar?.style.visibility;
    
    if (overlayBlocker) {
      overlayBlocker.style.pointerEvents = 'none';
      overlayBlocker.style.visibility = 'hidden';
    }
    if (overlayHighlight) {
      overlayHighlight.style.visibility = 'hidden';
    }
    if (toolbar) {
      toolbar.style.visibility = 'hidden';
    }
    
    const element = document.elementFromPoint(x, y);
    
    if (overlayBlocker) {
      overlayBlocker.style.pointerEvents = prevBlockerPointer || 'auto';
      overlayBlocker.style.visibility = prevBlockerVisibility || 'visible';
    }
    if (overlayHighlight) {
      overlayHighlight.style.visibility = prevHighlightVisibility || 'visible';
    }
    if (toolbar) {
      toolbar.style.visibility = prevToolbarVisibility || 'visible';
    }
    
    return element;
  }
  
  function handlePointerMove(event) {
    if (!isActive || isToolbarOpen) return;
    
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
    if (!isActive || isToolbarOpen) return;
    
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    
    const underlying = getUnderlyingElement(event.clientX, event.clientY);
    const tagged = underlying ? findTaggedElement(underlying) : null;
    
    if (tagged) {
      selectedTaggedElement = tagged;
      isToolbarOpen = true;
      showToolbar(event.clientX, event.clientY);
    }
  }
  
  function showToolbar(x, y) {
    if (toolbar) return;
    
    toolbar = document.createElement('div');
    toolbar.className = 'raccoon-inspect-toolbar';
    toolbar.innerHTML = `
      <form class="raccoon-inspect-form">
        <input 
          type="text" 
          class="raccoon-inspect-input" 
          placeholder="Enter your query..."
          autocomplete="off"
        />
        <button type="submit" class="raccoon-inspect-submit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>
    `;
    
    // Apply styles
    Object.assign(toolbar.style, {
      position: 'fixed',
      display: 'flex',
      alignItems: 'center',
      gap: '1px',
      padding: '4px',
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -2px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
      zIndex: '2147483647',
      opacity: '0',
      pointerEvents: 'auto',
      transition: 'opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      transform: 'translateY(-2px) scale(0.98)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    });
    
    const form = toolbar.querySelector('.raccoon-inspect-form');
    Object.assign(form.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      margin: '0',
      padding: '0'
    });
    
    const input = toolbar.querySelector('.raccoon-inspect-input');
    Object.assign(input.style, {
      width: '220px',
      maxWidth: 'calc(100vw - 80px)',
      height: '28px',
      padding: '0 10px',
      border: 'none',
      background: COLORS.muted,
      color: COLORS.accentForeground,
      borderRadius: '5px',
      fontSize: '13px',
      outline: 'none',
      boxSizing: 'border-box'
    });
    
    const submitBtn = toolbar.querySelector('.raccoon-inspect-submit');
    Object.assign(submitBtn.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      border: 'none',
      background: 'transparent',
      color: COLORS.mutedForeground,
      borderRadius: '5px',
      cursor: 'pointer',
      transition: 'background 0.1s ease, color 0.1s ease'
    });
    
    // Hover/active states for button
    submitBtn.addEventListener('mouseenter', () => {
      submitBtn.style.background = COLORS.muted;
      submitBtn.style.color = COLORS.accentForeground;
    });
    submitBtn.addEventListener('mouseleave', () => {
      submitBtn.style.background = 'transparent';
      submitBtn.style.color = COLORS.mutedForeground;
    });
    submitBtn.addEventListener('mousedown', () => {
      submitBtn.style.background = COLORS.primary;
      submitBtn.style.color = '#ffffff';
    });
    submitBtn.addEventListener('mouseup', () => {
      submitBtn.style.background = COLORS.muted;
      submitBtn.style.color = COLORS.accentForeground;
    });
    
    // Handle form submission
    form.addEventListener('submit', handleFormSubmit);
    
    // Handle Escape key to cancel
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelSelection();
      }
    });
    
    document.body.appendChild(toolbar);
    
    // Position toolbar near click, ensuring it stays within viewport
    const toolbarRect = toolbar.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = x + 10;
    let top = y + 10;
    
    // Adjust horizontal position if toolbar would overflow right edge
    if (left + toolbarRect.width > viewportWidth - 10) {
      left = x - toolbarRect.width - 10;
    }
    // Adjust if still overflowing left
    if (left < 10) {
      left = 10;
    }
    
    // Adjust vertical position if toolbar would overflow bottom edge
    if (top + toolbarRect.height > viewportHeight - 10) {
      top = y - toolbarRect.height - 10;
    }
    // Adjust if still overflowing top
    if (top < 10) {
      top = 10;
    }
    
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
    
    // Trigger visibility animation
    requestAnimationFrame(() => {
      toolbar.style.opacity = '1';
      toolbar.style.transform = 'translateY(0) scale(1)';
      input.focus();
    });
  }
  
  function handleFormSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const input = toolbar?.querySelector('.raccoon-inspect-input');
    const query = input?.value?.trim() || '';
    
    if (selectedTaggedElement) {
      postSelectionMessage({
        component: selectedTaggedElement.component || 'unknown',
        file: selectedTaggedElement.file || 'unknown',
        line: selectedTaggedElement.line || 'unknown',
        element: elementToString(selectedTaggedElement.target),
        query: query
      });
    }
    
    isActive = false;
    isToolbarOpen = false;
    selectedTaggedElement = null;
    cleanupOverlays();
  }
  
  function cancelSelection() {
    // Notify parent that selection was cancelled
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'SOURCE_SELECTOR_CANCELLED'
        }, '*');
      } catch (err) {
        console.warn('[raccoon-inspect] Failed to post cancellation message:', err);
      }
    }
    
    isActive = false;
    isToolbarOpen = false;
    selectedTaggedElement = null;
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
    
    if (toolbar) {
      const form = toolbar.querySelector('.raccoon-inspect-form');
      if (form) {
        form.removeEventListener('submit', handleFormSubmit);
      }
      toolbar.parentNode?.removeChild(toolbar);
      toolbar = null;
    }
  }
  
  function notifyParentReady() {
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'RACCOON_INSPECT_READY'
        }, '*');
      } catch (err) {
        console.warn('[raccoon-inspect] Failed to notify parent of ready state:', err);
      }
    }
  }
  
  function initSelector() {
    window.__sourceSelectorReady = true;
    
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'ENABLE_SOURCE_SELECTOR') {
        isActive = true;
        isToolbarOpen = false;
        selectedTaggedElement = null;
        createOverlays();
      } else if (event.data?.type === 'DISABLE_SOURCE_SELECTOR') {
        isActive = false;
        isToolbarOpen = false;
        selectedTaggedElement = null;
        cleanupOverlays();
      } else if (event.data?.type === 'REQUEST_RACCOON_INSPECT_STATUS') {
        notifyParentReady();
      }
    });
    
    // Notify parent that runtime is ready
    notifyParentReady();
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSelector);
  } else {
    initSelector();
  }
}
