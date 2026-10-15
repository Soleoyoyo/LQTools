'use strict';

/**
 * LQ Hub shared behaviour.
 * Reveal selected lower-page content only as it becomes visible.
 * Everything remains visible if JavaScript or IntersectionObserver is absent.
 */

(function initialiseMotion() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
        return;
    }

    const candidates = document.querySelectorAll(
        '.formula, .guide-content, .empty-note'
    );

    const observer = new IntersectionObserver((entries, activeObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add('motion-visible');
            activeObserver.unobserve(entry.target);
        });
    }, {
        threshold: 0.08,
        rootMargin: '0px 0px -28px 0px'
    });

    candidates.forEach((node) => {
        // Leave initially visible content alone: no flash or hidden page text.
        if (node.getBoundingClientRect().top < window.innerHeight - 28) {
            return;
        }

        node.classList.add('motion-pending');
        observer.observe(node);
    });

    // If accessibility settings change while the page is open, reveal all.
    reducedMotion.addEventListener('change', (event) => {
        if (!event.matches) return;

        candidates.forEach((node) => {
            node.classList.remove('motion-pending');
            node.classList.add('motion-visible');
            observer.unobserve(node);
        });
    });
})();
