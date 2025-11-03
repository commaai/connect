// timeline minimap
// rapidly change high level timeline stuff
// rapid seeking, etc

import { withStyles } from '@material-ui/core/styles';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Colors from '../../colors';
import { navigate } from '../../navigation';
import { selectRouteZoom } from '../../selectors/route';
import theme from '../../theme';
import { currentOffset } from '../../timeline';
import { seek } from '../../timeline/playback';
import { getSegmentNumber } from '../../utils';
import Thumbnails from './thumbnails';

const styles = () => ({
  base: {
    position: 'relative',
  },
  segments: {
    position: 'relative',
    left: '0px',
    width: '100%',
    overflow: 'hidden',
    height: 12,
  },
  segment: {
    position: 'absolute',
    height: 12,
    background: theme.palette.states.drivingBlue,
  },
  statusGradient: {
    background: 'linear-gradient(rgba(0, 0, 0, 0.0) 4%, rgba(255, 255, 255, 0.025) 10%, rgba(0, 0, 0, 0.1) 25%, rgba(0, 0, 0, 0.4))',
    height: 12,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    width: '100%',
    zIndex: 2,
  },
  segmentColor: {
    position: 'absolute',
    display: 'inline-block',
    height: 12,
    width: '100%',
    '&.active': {},
    '&.engage': {
      background: theme.palette.states.engagedGreen,
    },
    '&.overriding': {
      background: theme.palette.states.engagedGrey,
    },
    '&.alert': {
      '&.userPrompt': {
        background: theme.palette.states.alertOrange,
      },
      '&.critical': {
        background: theme.palette.states.alertRed,
      },
    },
    '&.bookmark, &.flag': {  // TODO: remove flag selector once 14 days expires old events caches
      background: theme.palette.states.userBookmark,
      zIndex: 1,
    },
  },
  thumbnails: {
    height: 20,
    width: '100%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    '& > div': {
      display: 'inline-block',
    },
  },
  ruler: {
    backgroundColor: 'rgb(37, 51, 61)',
    touchAction: 'none',
    width: '100%',
    height: 44,
  },
  rulerRemaining: {
    backgroundColor: 'rgba(29, 34, 37, 0.9)',
    borderLeft: '1px solid #D8DDDF',
    position: 'absolute',
    left: 0,
    height: 44,
    opacity: 0.45,
    pointerEvents: 'none',
    width: '100%',
  },
  loopStart: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRight: '1px solid rgba(0, 0, 0, 0.8)',
    position: 'absolute',
    left: 0,
    height: 44,
    pointerEvents: 'none',
  },
  loopEnd: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderLeft: '1px solid rgba(0, 0, 0, 0.8)',
    position: 'absolute',
    right: 0,
    height: 44,
    pointerEvents: 'none',
  },
  dragHighlight: {
    pointerEvents: 'none',
    background: 'rgba(255, 255, 255, 0.1)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.3)',
    borderRight: '1px solid rgba(255, 255, 255, 0.3)',
    position: 'absolute',
    height: 44,
  },
  hoverBead: {
    zIndex: 3,
    textAlign: 'center',
    borderRadius: 14,
    fontSize: '0.7em',
    padding: '3px 4px',
    border: `1px solid ${Colors.white10}`,
    backgroundColor: Colors.grey800,
    color: Colors.white,
    position: 'absolute',
    top: 83,
    left: 0,
    width: 80,
  },
});

const AlertStatusCodes = [
  'normal',
  'userPrompt',
  'critical',
];

function percentFromPointerEvent(ev) {
  const boundingBox = ev.currentTarget.getBoundingClientRect();
  const x = ev.pageX - boundingBox.left;
  return x / boundingBox.width;
}

const Timeline = ({ classes, hasRuler, className, route, thumbnailsVisible, zoomOverride }) => {
  const dispatch = useDispatch();
  const propsZoom = useSelector((state) => selectRouteZoom(state));
  const dongleId = useSelector((state) => state.dongleId);

  const rulerRemaining = useRef(null);
  const rulerRef = useRef(null);
  const dragBar = useRef(null);
  const hoverBead = useRef(null);
  const thumbnailsRef = useRef(null);
  const animationFrameId = useRef(null);
  const seekIndexRef = useRef(null);
  const resizeObserverRef = useRef(null);

  // Store zoom in a ref to avoid triggering state updates
  const zoomRef = useRef(zoomOverride || propsZoom);
  const [dragging, setDragging] = useState(null);
  const [hoverX, setHoverX] = useState(null);
  const [thumbnail, setThumbnail] = useState({ height: 0, width: 0 });

  // Update zoom ref when props change
  useEffect(() => {
    zoomRef.current = zoomOverride || propsZoom;
  }, [zoomOverride, propsZoom]);

  const percentToOffset = (perc) => {
    const zoom = zoomRef.current;
    return perc * (zoom.end - zoom.start) + zoom.start;
  };

  const offsetToPercent = (offset) => {
    const zoom = zoomRef.current;
    return (offset - zoom.start) / (zoom.end - zoom.start);
  };

  const segmentNum = (offset) => {
    if (route) {
      return getSegmentNumber(route, offset);
    }
    return null;
  };

  const getOffset = () => {
    animationFrameId.current = requestAnimationFrame(getOffset);
    let offset = currentOffset();
    if (seekIndexRef.current) {
      offset = seekIndexRef.current;
    }
    offset = Math.floor(offset);
    const percent = offsetToPercent(offset);
    if (rulerRemaining.current && rulerRemaining.current.parentElement) {
      rulerRemaining.current.style.left = `${Math.floor(10000 * percent) / 100}%`;
      rulerRemaining.current.style.width = `${100 - Math.floor(10000 * percent) / 100}%`;
    }
  };

  const handleClick = (ev) => {
    if (!dragging || Math.abs(dragging[1] - dragging[0]) <= 3) {
      const percent = percentFromPointerEvent(ev);
      dispatch(seek(percentToOffset(percent)));
    }
  };

  const handlePointerMove = (ev) => {
    ev.preventDefault();
    if (!rulerRef.current) {
      return;
    }

    const rulerBounds = rulerRef.current.getBoundingClientRect();
    const endDrag = Math.max(rulerBounds.x, Math.min(rulerBounds.x + rulerBounds.width, ev.pageX));
    if (dragging) {
      setDragging([dragging[0], endDrag]);
    }
    setHoverX(endDrag);
  };

  const handlePointerUp = (ev) => {
    // prevent preventDefault for back(3) and forward(4) mouse buttons
    if (ev.button !== 3 && ev.button !== 4) {
      ev.preventDefault();
    }

    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointermove', handlePointerMove);
    if (!dragging) {
      return;
    }
    setDragging(null);

    const rulerBounds = rulerRef.current.getBoundingClientRect();
    const startPercent = (Math.min(dragging[0], dragging[1]) - rulerBounds.x) / rulerBounds.width;
    const endPercent = (Math.max(dragging[0], dragging[1]) - rulerBounds.x) / rulerBounds.width;
    const startOffset = Math.round(percentToOffset(startPercent));
    const endOffset = Math.round(percentToOffset(endPercent));

    if (Math.abs(dragging[1] - dragging[0]) > 3) {
      const startSec = Math.floor(startOffset / 1000);
      const endSec = Math.floor(endOffset / 1000);
      navigate(`/${dongleId}/${route.log_id}/${startSec}/${endSec}`);
    } else if (ev.currentTarget !== document) {
      handleClick(ev);
    }
  };

  const handlePointerDown = (ev) => {
    if (ev.button !== 0) {
      return;
    }

    ev.preventDefault();
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointermove', handlePointerMove);
    setDragging([ev.pageX, ev.pageX]);
  };

  const handlePointerLeave = () => {
    setHoverX(null);
  };

  const onRulerRef = (el) => {
    rulerRef.current = el;
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  };

  const renderRouteEvents = (route) => {
    if (!route.events) {
      return null;
    }

    return route.events
      .filter((event) => event.data && event.data.end_route_offset_millis)
      .map((event) => {
        const style = {
          left: `${(event.route_offset_millis / route.duration) * 100}%`,
          width: `${((event.data.end_route_offset_millis - event.route_offset_millis) / route.duration) * 100}%`,
          minWidth: '1px',
        };
        const statusCls = event.data.alertStatus ? `${AlertStatusCodes[event.data.alertStatus]}` : '';
        return (
          <div
            key={route.fullname + event.route_offset_millis + event.type}
            style={style}
            className={ `${classes.segmentColor} ${event.type} ${statusCls}` }
          />
        );
      });
  };

  const renderRoute = () => {
    const zoom = zoomRef.current;
    if (!route.events) {
      return null;
    }

    const zoomDuration = zoom.end - zoom.start;
    const startPerc = (100 * (-zoom.start)) / zoomDuration;
    const widthPerc = (100 * route.duration) / zoomDuration;

    const style = {
      width: `${widthPerc}%`,
      left: `${startPerc}%`,
    };
    return (
      <div key={route.fullname} className={classes.segment} style={style}>
        { renderRouteEvents(route) }
      </div>
    );
  };

  // Initialize on mount - RAF loop
  // biome-ignore lint/correctness/useExhaustiveDependencies: getOffset intentionally not in deps to avoid infinite RAF loop
  useEffect(() => {
    animationFrameId.current = requestAnimationFrame(getOffset);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  // Set up ResizeObserver for thumbnails
  useEffect(() => {
    if (thumbnailsRef.current) {
      resizeObserverRef.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setThumbnail({ width, height });
        }
      });
      resizeObserverRef.current.observe(thumbnailsRef.current);

      return () => {
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
        }
      };
    }
  }, []);

  const hasRulerCls = hasRuler ? 'hasRuler' : '';

  let rulerBounds;
  if (rulerRef.current) {
    rulerBounds = rulerRef.current.getBoundingClientRect();
  }

  let hoverString; let
    hoverStyle;
  if (rulerBounds && hoverX) {
    const hoverOffset = percentToOffset((hoverX - rulerBounds.x) / rulerBounds.width);
    hoverStyle = { left: Math.max(-10, Math.min(rulerBounds.width - 70, hoverX - rulerBounds.x - 40)) };
    if (!Number.isNaN(hoverOffset)) {
      hoverString = dayjs(route.start_time_utc_millis + hoverOffset).format('HH:mm:ss');
      const segNum = segmentNum(hoverOffset);
      if (segNum !== null) {
        hoverString = `${segNum}, ${hoverString}`;
      }
    }
  }

  let draggerStyle;
  if (rulerBounds && dragging && Math.abs(dragging[1] - dragging[0]) > 0) {
    draggerStyle = {
      left: `${Math.min(dragging[1], dragging[0]) - rulerBounds.x}px`,
      width: `${Math.abs(dragging[1] - dragging[0])}px`,
    };
  }

  const baseWidthStyle = { width: '100%' };

  return (
    <div className={className}>
      <div role="presentation" className={ `${classes.base} ${hasRulerCls}` } style={ baseWidthStyle }>
        <div className={ `${classes.segments} ${hasRulerCls}` }>
          { route && renderRoute() }
          <div className={ `${classes.statusGradient} ${hasRulerCls}` } />
        </div>
        <div ref={thumbnailsRef} className={ `${classes.thumbnails} ${hasRulerCls}` }>
          { thumbnailsVisible && (
            <Thumbnails
              className={classes.thumbnail}
              currentRoute={route}
              percentToOffset={percentToOffset}
              thumbnail={thumbnail}
              hasRuler={hasRuler}
            />
          ) }
        </div>
        { hasRuler && (
          <>
            <div
              ref={ onRulerRef }
              className={classes.ruler}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
            >
              <div ref={rulerRemaining} className={classes.rulerRemaining} />
              { draggerStyle && <div ref={dragBar} className={classes.dragHighlight} style={draggerStyle} /> }
            </div>
            { hoverString && (
              <div ref={hoverBead} className={classes.hoverBead} style={hoverStyle}>
                { hoverString }
              </div>
            ) }
          </>
        ) }
      </div>
    </div>
  );
};

export default withStyles(styles)(Timeline);
