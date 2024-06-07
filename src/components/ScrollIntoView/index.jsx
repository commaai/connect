import React, { useEffect, useRef } from 'react';

const ScrollIntoView = ({ onInView, children, key }) => {
  const elementRef = useRef(null);

  useEffect(() => {
    const options = {
      root: null, // relative to the viewport
      rootMargin: '0px',
      threshold: 0.1 // 10% of the target's visibility
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          onInView();
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
