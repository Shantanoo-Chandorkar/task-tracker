'use client';

import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

// Module-level so dnd-kit's internal useSensor memoization sees a stable options reference.
const MOUSE_ACTIVATION = { distance: 5 };
const TOUCH_ACTIVATION = { delay: 200, tolerance: 8 };

/**
 * The drag sensors every sortable list uses: mouse, touch and keyboard.
 *
 * @returns {import('@dnd-kit/core').SensorDescriptor<object>[]} Sensors to pass to `DndContext`
 */
export function useDragSensors() {
    return useSensors(
        useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
        // A delay and move tolerance let a tap or scroll through; PointerSensor would race with this sensor
        useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
}
