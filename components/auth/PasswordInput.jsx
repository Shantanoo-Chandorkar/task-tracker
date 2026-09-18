'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from '@/components/ui/input-group';

/**
 * Password field with a show/hide toggle, shared by the login and signup forms.
 *
 * @param {object} props - Forwarded to the underlying input (id, autoComplete, value, onChange, disabled, etc.)
 */
export default function PasswordInput(props) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <InputGroup>
            <InputGroupInput type={isVisible ? 'text' : 'password'} {...props} />
            <InputGroupAddon align="inline-end">
                <InputGroupButton
                    type="button"
                    size="icon-xs"
                    onClick={() => setIsVisible((current) => !current)}
                    aria-label={isVisible ? 'Hide password' : 'Show password'}
                >
                    {isVisible ? <EyeOff /> : <Eye />}
                </InputGroupButton>
            </InputGroupAddon>
        </InputGroup>
    );
}
