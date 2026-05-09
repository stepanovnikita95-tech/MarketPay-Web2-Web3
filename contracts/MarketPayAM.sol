// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";   
import {AccessManaged} from "@openzeppelin/contracts/access/manager/AccessManaged.sol";

contract MarketPayAM is AccessManaged, ReentrancyGuard, Pausable{
    using SafeERC20 for IERC20;

    uint256 public constant MAX_BATCH_SIZE = 100;

    mapping(address => bool) public isTokenApproved;
    mapping(bytes32 => bool) private _processedOrders;

    event PaymentDone(
        string orderId,
        address indexed customer,
        address token,
        uint256 indexed amount
    );
    event PaymentETHDone(string orderId, address indexed customer, uint256 indexed amountETH);
    event BatchPaymentDone(
        string[] orderIds,
        address indexed customer,
        address token,
        uint256[] amounts,
        uint256 indexed totalAmount
    );
    event BatchWithETHPaymentDone(string[] orderIds, address indexed customer, uint256[] amounts, uint256 indexed totalAmountETH);
    event Withdrawn(address indexed token, address indexed to, uint256 indexed amount);
    event WithdrawnETH(address indexed to, uint256 indexed amountETH);
    event WithdrawnAll(address indexed token, address indexed to, uint256 indexed balanceContract);
    event WithdrawnETHAll(address indexed to, uint256 indexed balanceContractETH);
    event TokenApprovalSet(address indexed token);
    event TokenApprovalRemoved(address indexed token);

    error NonSupportToken();
    error TokenAlreadyExisted();
    error TokenNotExist();
    error ZeroAmount();
    error ZeroAddress();
    error NotEnoughFunds();
    error LengthDoesNotMatch();
    error EmptyBatch();
    error LostItems();
    error TransactionFailed();
    error BatchTooLarge();
    error MsgValueMismatch();
    error OrderAlreadyProcessed();
    error InvalidOrderId();
    error UsePayWithETH();

    constructor (address initialAuthority) AccessManaged(initialAuthority) {}

    function addTokenApproval(address _token) external restricted whenNotPaused {
        require(_token != address(0), ZeroAddress());
        require(!isTokenApproved[_token], TokenAlreadyExisted());
        isTokenApproved[_token] = true;
        emit TokenApprovalSet(_token);
    }

    function removeTokenApproval(address _token) external restricted whenNotPaused {
        require(_token != address(0), ZeroAddress());
        require(isTokenApproved[_token], TokenNotExist());
        isTokenApproved[_token] = false;
        emit TokenApprovalRemoved(_token);
    }
    
    function pay(string calldata _orderId, address _token, uint256 _amount) external nonReentrant whenNotPaused {
        uint256 idLen = bytes(_orderId).length;
        require(idLen > 0, LostItems());
        require(idLen <= 64, InvalidOrderId());
        require(_token != address(0), ZeroAddress());
        require(isTokenApproved[_token], NonSupportToken());
        require(_amount > 0, ZeroAmount());

        bytes32 orderHash = keccak256(abi.encodePacked(_orderId));
        require(!_processedOrders[orderHash], OrderAlreadyProcessed());
        _processedOrders[orderHash] = true;

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        emit PaymentDone(_orderId, msg.sender, _token, _amount);
    }

    function payWithETH(string calldata _orderId) external payable nonReentrant whenNotPaused {
        uint256 idLen = bytes(_orderId).length;
        require(idLen > 0, LostItems());
        require(idLen <= 64, InvalidOrderId());
        require(msg.value > 0, ZeroAmount());

        bytes32 orderHash = keccak256(abi.encodePacked(_orderId));
        require(!_processedOrders[orderHash], OrderAlreadyProcessed());
        _processedOrders[orderHash] = true;

        emit PaymentETHDone(_orderId, msg.sender, msg.value);
    }

    function payBatch(string[] calldata _orderIds, address _token, uint256[] calldata _amounts) external nonReentrant whenNotPaused {
        require(_token != address(0), ZeroAddress());
        require(isTokenApproved[_token], NonSupportToken());
        IERC20 token = IERC20(_token);

        require(_orderIds.length != 0, EmptyBatch());
        require(_orderIds.length == _amounts.length, LengthDoesNotMatch());
        require(_orderIds.length <= MAX_BATCH_SIZE, BatchTooLarge());

        uint256 totalAmount;

        for (uint256 i = 0; i < _orderIds.length; ++i) {
            uint256 idLen = bytes(_orderIds[i]).length;
            require(idLen != 0, LostItems());
            require(idLen <= 64, InvalidOrderId());
            bytes32 orderHash = keccak256(abi.encodePacked(_orderIds[i]));
            require(!_processedOrders[orderHash], OrderAlreadyProcessed());
            _processedOrders[orderHash] = true;
            require(_amounts[i] != 0, ZeroAmount());
            totalAmount += _amounts[i];
        }

        token.safeTransferFrom(msg.sender, address(this), totalAmount);

        emit BatchPaymentDone(_orderIds, msg.sender, _token, _amounts, totalAmount);
    }

    function payBatchWithETH(string[] calldata _orderIds, uint256[] calldata _amounts) external payable nonReentrant whenNotPaused {

        require(_orderIds.length != 0, EmptyBatch());
        require(_orderIds.length == _amounts.length, LengthDoesNotMatch());
        require(_orderIds.length <= MAX_BATCH_SIZE, BatchTooLarge());
        require(msg.value > 0, ZeroAmount());

        uint256 totalAmount;

        for (uint256 i = 0; i < _orderIds.length; ++i) {
            uint256 idLen = bytes(_orderIds[i]).length;
            require(idLen > 0, LostItems());
            require(idLen <= 64, InvalidOrderId());
            bytes32 orderHash = keccak256(abi.encodePacked(_orderIds[i]));
            require(!_processedOrders[orderHash], OrderAlreadyProcessed());
            _processedOrders[orderHash] = true;
            require(_amounts[i] != 0, ZeroAmount());
            totalAmount += _amounts[i];
        }

        require(totalAmount == msg.value, MsgValueMismatch());

        emit BatchWithETHPaymentDone(_orderIds, msg.sender, _amounts, msg.value);
    }

    function withdrawal(address _token, address _to, uint256 _amount) external nonReentrant restricted whenNotPaused {
        require(_token != address(0), ZeroAddress());
        require(_to != address(0), ZeroAddress());
        require(_amount > 0, ZeroAmount());

        IERC20 token = IERC20(_token);
        uint256 balanceContract = token.balanceOf(address(this));
        require(balanceContract >= _amount, NotEnoughFunds());

        token.safeTransfer(_to, _amount);

        emit Withdrawn(_token, _to, _amount);
    }

    function withdrawalETH(address payable _to, uint256 _amount) external nonReentrant restricted whenNotPaused {
        require(_to != address(0), ZeroAddress());
        require(_amount > 0, ZeroAmount());
        require(address(this).balance >= _amount, NotEnoughFunds());

        (bool success, ) = _to.call{value:_amount}("");
        require(success, TransactionFailed());

        emit WithdrawnETH(_to, _amount);
    } 

    function withdrawalAll(address _token, address _to) external nonReentrant restricted {
        require(_token != address(0), ZeroAddress());
        require(_to != address(0), ZeroAddress());

        IERC20 token = IERC20(_token);
        uint256 balanceContract = token.balanceOf(address(this));
        require(balanceContract > 0, NotEnoughFunds());

        token.safeTransfer(_to, balanceContract);

        emit WithdrawnAll(_token, _to, balanceContract);
    }

    function withdrawalAllETH(address payable _to) external nonReentrant restricted {
        uint256 balanceContractETH = address(this).balance;
        
        require(_to != address(0), ZeroAddress());
        require(balanceContractETH > 0, NotEnoughFunds());

        (bool success, ) = _to.call{value: balanceContractETH}("");
        require(success, TransactionFailed());

        emit WithdrawnETHAll(_to, balanceContractETH);

    }

    function pause() external restricted {
        _pause();
    }

    function unpause() external restricted {
        _unpause();
    }

    receive() external payable {
        revert UsePayWithETH();
    }
}