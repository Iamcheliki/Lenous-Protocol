
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract StakingContract is ReentrancyGuard, Ownable {
    IERC20 public rewardsToken;
    IERC20 public stakingToken;

    uint256 public rate; // Rewards per second per token
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _lastUpdateTime;
    mapping(address => uint256) private _rewards;
    mapping(address => uint256) private _stakeDuration;

    uint256 constant ONE_MONTH = 30 days;
    uint256 constant THREE_MONTHS = 90 days;
    uint256 constant SIX_MONTHS = 180 days;
    uint256 constant TWELVE_MONTHS = 360 days;

    event Staked(address indexed user, uint256 amount, uint256 duration);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event Changeratioannounce(uint256 ratio);

    constructor(
        address _stakingToken,
        address _rewardsToken,
        uint256 _rate
    ) Ownable(msg.sender) {
        stakingToken = IERC20(_stakingToken);
        rewardsToken = IERC20(_rewardsToken);
        rate = _rate;
    }

    function stake(uint256 amount, uint256 duration) external nonReentrant {
        require(amount > 0, "Cannot stake 0");
        require(
            duration == ONE_MONTH ||
                duration == THREE_MONTHS ||
                duration == SIX_MONTHS ||
                duration == TWELVE_MONTHS,
            "Invalid staking duration"
        );

        _totalSupply += amount;
        _balances[msg.sender] += amount;
        _lastUpdateTime[msg.sender] = block.timestamp;
        _stakeDuration[msg.sender] = duration;

        stakingToken.transferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, duration);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot withdraw 0");
        require(
            _balances[msg.sender] >= amount,
            "Withdraw amount exceeds balance"
        );

        uint256 reward = earned(msg.sender);
        if (reward > 0) {
            _rewards[msg.sender] = 0;
            rewardsToken.transfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }

        _totalSupply -= amount;
        _balances[msg.sender] -= amount;
        stakingToken.transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function claimReward() external nonReentrant {
        uint256 reward = earned(msg.sender);
        require(reward > 0, "No reward available");

        _rewards[msg.sender] = 0;
        _lastUpdateTime[msg.sender] = block.timestamp;
        rewardsToken.transfer(msg.sender, reward);
        emit RewardPaid(msg.sender, reward);
    }

    function earned(address account) public view returns (uint256) {
        uint256 blockTime = block.timestamp;
        uint256 duration = _stakeDuration[account];
        uint256 stakingTime = blockTime - _lastUpdateTime[account];
        uint256 effectiveTime = (stakingTime / duration) * duration;

        return
            (_balances[account] * effectiveTime * rate) /
            1e18 +
            _rewards[account];
    }

    function changeratio(uint256 _ratio) public onlyOwner {
        rate = _ratio;
        emit Changeratioannounce(rate);
    }
}
