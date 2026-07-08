import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ── Futuristic Flyout Section (Command Strip Menu) ──────────────────────
function FlyoutSection({ title, icon: Icon, children }) {
    const [isHovered, setIsHovered] = useState(false);
    const [anchorRight, setAnchorRight] = useState(false);
    const timeoutRef = useRef(null);
    const containerRef = useRef(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        // Check if flyout would overflow the right edge
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const flyoutWidth = 360;
            const spaceOnRight = window.innerWidth - rect.left;
            setAnchorRight(spaceOnRight < flyoutWidth + 20);
        }
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setIsHovered(false);
        }, 200); // 200ms forgiveness buffer
    };

    return (
        <div 
            ref={containerRef}
            className="flyout-container"
            onMouseEnter={handleMouseEnter} 
            onMouseLeave={handleMouseLeave}
            style={{ position: "relative", display: "inline-block", margin: "0 4px", height: "100%", display: "flex", alignItems: "center" }}
        >
            {/* The Command Strip Link */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                padding: "8px 10px",
                color: isHovered ? "#f97316" : "#a1a1aa",
                cursor: "pointer", transition: "color 0.2s",
                fontWeight: 600, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.5px"
            }}>
                {title}
            </div>

            {/* The Floating Panel */}
            {isHovered && (
                <div style={{
                    position: "absolute", 
                    top: "100%", 
                    ...(anchorRight
                        ? { right: 0 }           // anchor to right edge when near viewport edge
                        : { left: "50%", marginLeft: "-180px" }  // centered otherwise
                    ),
                    paddingTop: "12px", /* Invisible hover bridge */
                    zIndex: 1000
                }}>
                    <div style={{
                        width: "360px",
                        background: "rgba(9, 9, 11, 0.95)",
                        border: "1px solid rgba(234, 88, 12, 0.25)",
                        borderRadius: "8px", padding: "14px",
                        boxShadow: "0 10px 40px rgba(0,0,0,0.9), 0 0 20px rgba(234, 88, 12, 0.1)",
                        backdropFilter: "blur(24px)",
                        animation: "flyoutAppear 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards"
                    }}>
                        <div style={{
                        color: "#fdba74", fontSize: 11, fontWeight: 700, 
                        letterSpacing: 1, textTransform: "uppercase",
                        borderBottom: "1px solid rgba(234, 88, 12, 0.15)",
                        paddingBottom: "10px", marginBottom: "12px",
                        display: "flex", alignItems: "center", gap: "8px"
                    }}>
                        {Icon && <Icon size={14} color="#f97316" />}
                        {title}
                    </div>
                    {children}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Glow Slider ───────────────────────────────────────────────
function Slider({ label, value, min, max, step, onChange }) {
    return (
        <div style={{ marginBottom: 6 }}>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 2
            }}>
                <span style={{ fontSize: 9, color: "#a1a1aa", letterSpacing: 0.5 }}>{label}</span>
                <span style={{ fontSize: 9, color: "#fdba74", fontFamily: "monospace", textShadow: "0 0 5px rgba(253, 186, 116, 0.3)" }}>
                    {typeof value === "number" && value % 1 !== 0 ? value.toFixed(3) : value}
                </span>
            </div>
            <input
                type="range"
                min={min} max={max} step={step}
                value={value}
                onChange={e => onChange(
                    step % 1 !== 0
                        ? parseFloat(e.target.value)
                        : parseInt(e.target.value)
                )}
                className="glow-slider"
                style={{
                    width: "100%",
                    accentColor: "#ea580c",
                    cursor: "pointer",
                    height: 4,
                    background: "#27272a",
                    border: "none",
                    outline: "none"
                }}
            />
        </div>
    );
}

// ── Futuristic Button ─────────────────────────────────────────
function Btn({ children, onClick, active, disabled, style = {}, icon: Icon, color }) {
    const isActive = active;
    let customBg = "rgba(39, 39, 42, 0.6)"; 
    if (isActive) customBg = "rgba(234, 88, 12, 0.2)";
    if (disabled) customBg = "rgba(24, 24, 27, 0.6)";

    // Default button style
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`cyber-btn ${isActive ? "active" : ""}`}
            style={{
                width: "100%",
                padding: "6px 10px",
                marginBottom: 4,
                background: customBg,
                color: disabled ? "#52525b" : (isActive ? "#ffedd5" : "#d4d4d8"),
                border: isActive ? "1px solid rgba(234, 88, 12, 0.8)" : "1px solid rgba(63, 63, 70, 0.5)",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.5,
                cursor: disabled ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                boxShadow: isActive ? "0 0 10px rgba(234, 88, 12, 0.3), inset 0 0 6px rgba(234, 88, 12, 0.1)" : "none",
                ...style
            }}
        >
            {Icon && <Icon size={12} color={isActive ? "#f97316" : "currentColor"} />}
            {children}
        </button>
    );
}

// ── Toggle Switch ─────────────────────────────────────────────
function Toggle({ label, value, onChange }) {
    return (
        <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "4px 0",
            marginBottom: 4
        }}>
            <span style={{ fontSize: 10, color: "#d4d4d8", letterSpacing: 0.5 }}>{label}</span>
            <button
                onClick={() => onChange(!value)}
                style={{
                    position: "relative",
                    width: 32,
                    height: 16,
                    background: value ? "rgba(234, 88, 12, 0.8)" : "#27272a",
                    border: value ? "1px solid #f97316" : "1px solid #3f3f46",
                    borderRadius: 10,
                    cursor: "pointer",
                    boxShadow: value ? "0 0 10px rgba(234, 88, 12, 0.5)" : "none",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                }}
            >
                <div style={{
                    position: "absolute",
                    top: 1,
                    left: value ? 17 : 1,
                    width: 12,
                    height: 12,
                    background: value ? "#fff" : "#a1a1aa",
                    borderRadius: "50%",
                    boxShadow: value ? "0 0 5px rgba(255,255,255,0.8)" : "none",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                }} />
            </button>
        </div>
    );
}

// ── Legend row ────────────────────────────────────────────────
function Legend({ items }) {
    return (
        <div style={{
            padding: "6px",
            background: "rgba(9, 9, 11, 0.6)",
            border: "1px solid rgba(234, 88, 12, 0.1)",
            borderRadius: 4,
            marginBottom: 4,
            display: "flex",
            flexDirection: "column",
            gap: 4
        }}>
            {items.map(({ color, label }) => (
                <div key={label} style={{
                    display: "flex", alignItems: "center", gap: 6
                }}>
                    <div style={{
                        width: 8, height: 8,
                        background: color,
                        borderRadius: 2,
                        flexShrink: 0,
                        boxShadow: `0 0 8px ${color}80`,
                        border: "1px solid rgba(255,255,255,0.2)"
                    }} />
                    <span style={{ fontSize: 9, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {label}
                    </span>
                </div>
            ))}
        </div>
    );
}

export { FlyoutSection as Section, Slider, Btn, Toggle, Legend };