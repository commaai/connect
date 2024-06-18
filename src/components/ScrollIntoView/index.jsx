import React, { useEffect, useRef } from 'react';

const ScrollIntoView = ({ onInView, children }) => {
  const elementRef = useRef(null);
  const hasDispatched = useRef(false);

  useEffect(() => {
    const options = {
      root: null, // relative to the viewport
      rootMargin: '0px',
      threshold: 0.1 // 10% of the target's visibility
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !hasDispatched.current) {
          onInView();
          hasDispatched.current = true
        }
      });
    }, options);

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      if (observer && elementRef.current) {
        observer.unobserve(elementRef.current);
      }
    };
  }, [onInView]);

  return (
    <div ref={elementRef}>
      {children}
    </div>
  );
};

export default ScrollIntoView;
