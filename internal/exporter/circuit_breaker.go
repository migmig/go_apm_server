package exporter

import (
	"fmt"
	"sync"
	"time"
)

type State int

const (
	StateClosed State = iota
	StateOpen
	StateHalfOpen
)

type CircuitBreaker struct {
	mu           sync.RWMutex
	state        State
	failCount    int
	maxFailures  int
	openDuration time.Duration
	lastFailure  time.Time
	name         string
}

func NewCircuitBreaker(name string, maxFailures int, openDuration time.Duration) *CircuitBreaker {
	if maxFailures <= 0 {
		maxFailures = 5
	}
	if openDuration <= 0 {
		openDuration = 30 * time.Second
	}
	return &CircuitBreaker{
		name:         name,
		state:        StateClosed,
		maxFailures:  maxFailures,
		openDuration: openDuration,
	}
}

func (cb *CircuitBreaker) Allow() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if cb.state == StateClosed {
		return true
	}

	if cb.state == StateOpen {
		if time.Since(cb.lastFailure) > cb.openDuration {
			cb.state = StateHalfOpen
			fmt.Printf("Circuit Breaker [%s] transitioned to HALF-OPEN\n", cb.name)
			return true
		}
		return false
	}

	// In Half-Open, we allow one trial
	return true
}

func (cb *CircuitBreaker) Success() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if cb.state != StateClosed {
		fmt.Printf("Circuit Breaker [%s] transitioned to CLOSED (Recovered)\n", cb.name)
	}
	cb.state = StateClosed
	cb.failCount = 0
}

func (cb *CircuitBreaker) Failure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failCount++
	cb.lastFailure = time.Now()

	if cb.state == StateHalfOpen || cb.failCount >= cb.maxFailures {
		if cb.state != StateOpen {
			fmt.Printf("Circuit Breaker [%s] transitioned to OPEN (Suspended for %v)\n", cb.name, cb.openDuration)
		}
		cb.state = StateOpen
	}
}

func (cb *CircuitBreaker) State() State {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state
}
